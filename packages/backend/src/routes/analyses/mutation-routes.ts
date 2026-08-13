import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  PermissionScope,
  Prisma,
  prisma,
  SystemComponent,
} from "@go-watchtower/database";
import {
  AnalysisStatuses,
  SystemEventActions,
  SystemEventResources,
  AnalysisOrigins,
  AutomationReviewStatuses,
} from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { getPermissionScope } from "../../services/permission.service.js";
import { scoreAnalysis } from "../../services/analysis-scoring.service.js";
import { buildDiff } from "../../services/system-event.service.js";
import { HttpError } from "../../utils/http-errors.js";
import { toJsonInput } from "../../utils/json-cast.js";
import { supersedePendingReviews } from "../../services/automation/review-supersede.js";
import { withTransactionRetry } from "../../utils/transaction-retry.js";
import {
  AlarmAnalysisParamsSchema,
  AlarmAnalysisResponseSchema,
  CreateAlarmAnalysisBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  ProductIdParamsSchema,
  UpdateAlarmAnalysisBodySchema,
  type AlarmAnalysisParams,
  type CreateAlarmAnalysisBody,
  type ProductIdParams,
  type UpdateAlarmAnalysisBody,
} from "./schemas.js";
import {
  analysisInclude,
  formatAnalysisResponse,
  processLinks,
  type TransactionClient,
} from "./shared.js";

/**
 * Conflitto di concorrenza segnalato **abortendo** la transazione.
 *
 * Ritornarlo invece che lanciarlo lascerebbe committate le scritture che la
 * risposta 409 dichiara non applicate: `$transaction` committa se il callback
 * ritorna normalmente.
 */
class AnalysisConcurrencyConflict extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "AnalysisConcurrencyConflict";
  }
}

/**
 * Verifica che la proposta automatica su cui l'operatore sta scrivendo sia
 * ancora quella che aveva davanti (§4.8.3).
 *
 * Salvare una modifica su un'analisi con review pendente **la conferma** a nome
 * di chi salva: se nel frattempo un re-apply ha sostituito il contenuto, quella
 * firma finisce su una versione mai vista. È l'unico modo silenzioso di
 * attribuire a un operatore una decisione che non ha preso, e per questo il
 * token è obbligatorio esattamente lì e solo lì — altrove resta facoltativo, e i
 * client che non lo inviano continuano a funzionare.
 *
 * @param tx - Transazione con i lock già acquisiti
 * @param currentExecutionId - `lastAppliedExecutionId` riletta sotto lock
 * @param expected - Token dichiarato dal client, `undefined` se assente
 * @throws AnalysisConcurrencyConflict se il token manca dove serve o non combacia
 */
async function assertProposalStillTheOneSeen(
  tx: TransactionClient,
  currentExecutionId: string | null,
  expected: string | null | undefined,
): Promise<void> {
  if (expected !== undefined) {
    if (expected !== currentExecutionId) {
      throw new AnalysisConcurrencyConflict(
        "La proposta automatica è cambiata da quando hai aperto l'analisi: ricarica e riprova",
      );
    }
    return;
  }
  if (currentExecutionId === null) return;
  const pending = await tx.automaticRunbookExecution.findFirst({
    where: { id: currentExecutionId, reviewStatus: AutomationReviewStatuses.PENDING },
    select: { id: true },
  });
  if (pending !== null) {
    throw new AnalysisConcurrencyConflict(
      "L'analisi ha una proposta automatica in attesa di revisione: la modifica deve dichiarare expectedLastAppliedExecutionId",
    );
  }
}

export async function registerAnalysisMutationRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.post<{ Params: ProductIdParams; Body: CreateAlarmAnalysisBody }>(
    "/products/:productId/analyses",
    {
      config: { rateLimit: false },
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "write"),
      ],
      schema: {
        tags: ["analyses"],
        summary: "Create a new analysis",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateAlarmAnalysisBodySchema,
        response: {
          201: AlarmAnalysisResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId } = request.params;
        const [product, operator, alarm, environment] = await Promise.all([
          prisma.product.findUnique({
            where: { id: productId },
            select: { id: true },
          }),
          prisma.user.findUnique({ where: { id: request.body.operatorId } }),
          prisma.alarm.findFirst({
            where: { id: request.body.alarmId, productId },
          }),
          prisma.environment.findFirst({
            where: { id: request.body.environmentId, productId },
          }),
        ]);

        if (!product) return HttpError.notFound(reply, "Product");
        if (!operator) return HttpError.badRequest(reply, "Operator not found");
        if (!alarm) {
          return reply.status(400).send({
            error: "Alarm not found or does not belong to this product",
          });
        }
        if (!environment) {
          return reply.status(400).send({
            error: "Environment not found or does not belong to this product",
          });
        }

        const finalActionIds = request.body.finalActionIds ?? [];
        const resourceIds = request.body.resourceIds ?? [];
        const downstreamIds = request.body.downstreamIds ?? [];

        const [finalActionCount, runbook, resourceCount, downstreamCount] =
          await Promise.all([
            finalActionIds.length > 0
              ? prisma.finalAction.count({
                  where: { id: { in: finalActionIds }, productId },
                })
              : Promise.resolve(0),
            request.body.runbookId
              ? prisma.runbook.findFirst({
                  where: { id: request.body.runbookId, productId },
                })
              : Promise.resolve(null),
            resourceIds.length > 0
              ? prisma.resource.count({
                  where: { id: { in: resourceIds }, productId },
                })
              : Promise.resolve(0),
            downstreamIds.length > 0
              ? prisma.downstream.count({
                  where: { id: { in: downstreamIds }, productId },
                })
              : Promise.resolve(0),
          ]);

        if (finalActionIds.length > 0 && finalActionCount !== finalActionIds.length) {
          return reply.status(400).send({
            error:
              "One or more final actions not found or do not belong to this product",
          });
        }
        if (request.body.runbookId && !runbook) {
          return reply.status(400).send({
            error: "Runbook not found or does not belong to this product",
          });
        }
        if (resourceIds.length > 0 && resourceCount !== resourceIds.length) {
          return reply.status(400).send({
            error:
              "One or more resources not found or do not belong to this product",
          });
        }
        if (downstreamIds.length > 0 && downstreamCount !== downstreamIds.length) {
          return reply.status(400).send({
            error:
              "One or more downstreams not found or do not belong to this product",
          });
        }

        const { ignoreReasonCode, ignoreDetails } = request.body;
        const resolvedAnalysisType = request.body.analysisType ?? "ANALYZABLE";
        if (resolvedAnalysisType === "IGNORABLE" && !ignoreReasonCode) {
          return HttpError.badRequest(
            reply,
            "ignoreReasonCode is required when analysisType is IGNORABLE",
          );
        }

        const analysis = await prisma.$transaction(async (tx: TransactionClient) => {
          return tx.alarmAnalysis.create({
            data: {
              analysisDate: new Date(request.body.analysisDate),
              firstAlarmAt: new Date(request.body.firstAlarmAt),
              lastAlarmAt: new Date(request.body.lastAlarmAt),
              occurrences: request.body.occurrences ?? 1,
              isOnCall: request.body.isOnCall ?? false,
              analysisType: resolvedAnalysisType,
              status: request.body.status ?? "CREATED",
              alarmId: request.body.alarmId,
              errorDetails: request.body.errorDetails || null,
              conclusionNotes: request.body.conclusionNotes || null,
              ignoreReasonCode:
                resolvedAnalysisType === "IGNORABLE"
                  ? (ignoreReasonCode ?? null)
                  : null,
              ignoreDetails:
                resolvedAnalysisType === "IGNORABLE"
                  ? ignoreDetails != null
                    ? toJsonInput(ignoreDetails)
                    : Prisma.DbNull
                  : Prisma.DbNull,
              operatorId: request.body.operatorId,
              productId,
              environmentId: request.body.environmentId,
              runbookId: request.body.runbookId || null,
              links: processLinks(request.body.links),
              trackingIds: request.body.trackingIds ?? [],
              createdById: request.user.userId,
              finalActions:
                request.body.finalActionIds &&
                request.body.finalActionIds.length > 0
                  ? {
                      createMany: {
                        data: request.body.finalActionIds.map((finalActionId) => ({
                          finalActionId,
                        })),
                      },
                    }
                  : undefined,
              resources:
                request.body.resourceIds && request.body.resourceIds.length > 0
                  ? {
                      createMany: {
                        data: request.body.resourceIds.map((resourceId) => ({
                          resourceId,
                        })),
                      },
                    }
                  : undefined,
              downstreams:
                request.body.downstreamIds &&
                request.body.downstreamIds.length > 0
                  ? {
                      createMany: {
                        data: request.body.downstreamIds.map((downstreamId) => ({
                          downstreamId,
                        })),
                      },
                    }
                  : undefined,
            },
            include: analysisInclude,
          });
        });

        request.auditEvents.push({
          action: SystemEventActions.ANALYSIS_CREATED,
          resource: SystemEventResources.ALARM_ANALYSES,
          resourceId: analysis.id,
          resourceLabel: analysis.alarm?.name ?? null,
          metadata: { created: analysis },
        });

        reply.status(201).send(formatAnalysisResponse(analysis));
        scoreAnalysis(analysis.id, prisma).catch((err) => {
          fastify.log.error(
            { err, analysisId: analysis.id },
            "Failed to score analysis after create",
          );
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create analysis";
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.put<{ Params: AlarmAnalysisParams; Body: UpdateAlarmAnalysisBody }>(
    "/products/:productId/analyses/:id",
    {
      config: { rateLimit: false },
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Update an analysis",
        security: [{ bearerAuth: [] }],
        params: AlarmAnalysisParamsSchema,
        body: UpdateAlarmAnalysisBodySchema,
        response: {
          200: AlarmAnalysisResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId, id } = request.params;
        const existing = await prisma.alarmAnalysis.findFirst({
          where: { id, productId },
          include: {
            resources: { select: { resourceId: true } },
            downstreams: { select: { downstreamId: true } },
            finalActions: { select: { finalActionId: true } },
          },
        });

        if (!existing) {
          return HttpError.notFound(reply, "Analysis");
        }

        const writeScope = await getPermissionScope(
          request.user.userId,
          SystemComponent.ALARM_ANALYSIS,
          "write",
        );
        const canWriteForThis =
          writeScope === PermissionScope.ALL ||
          (writeScope === PermissionScope.OWN &&
            existing.createdById === request.user.userId);
        if (!canWriteForThis) {
          return HttpError.forbidden(reply);
        }

        if (writeScope === PermissionScope.OWN) {
          const lockSetting = await prisma.systemSetting.findUnique({
            where: { key: "analysis_edit_lock_days" },
          });
          const lockDays =
            typeof lockSetting?.value === "number" ? lockSetting.value : 7;
          const daysSince = Math.floor(
            (Date.now() - existing.createdAt.getTime()) / 86_400_000,
          );
          if (daysSince >= lockDays) {
            return HttpError.forbidden(
              reply,
              `L'analisi non può più essere modificata (blocco dopo ${lockDays} giorni dalla creazione)`,
            );
          }
        }

        const [operator, alarm, environment] = await Promise.all([
          request.body.operatorId
            ? prisma.user.findUnique({ where: { id: request.body.operatorId } })
            : Promise.resolve(true),
          request.body.alarmId
            ? prisma.alarm.findFirst({
                where: { id: request.body.alarmId, productId },
              })
            : Promise.resolve(true),
          request.body.environmentId
            ? prisma.environment.findFirst({
                where: { id: request.body.environmentId, productId },
              })
            : Promise.resolve(true),
        ]);

        if (request.body.operatorId && !operator) {
          return HttpError.badRequest(reply, "Operator not found");
        }
        if (request.body.alarmId && !alarm) {
          return reply.status(400).send({
            error: "Alarm not found or does not belong to this product",
          });
        }
        if (request.body.environmentId && !environment) {
          return reply.status(400).send({
            error: "Environment not found or does not belong to this product",
          });
        }

        const updateFinalActionIds = request.body.finalActionIds ?? [];
        const updateResourceIds = request.body.resourceIds ?? [];
        const updateDownstreamIds = request.body.downstreamIds ?? [];

        const [
          updateFinalActionCount,
          updateRunbook,
          updateResourceCount,
          updateDownstreamCount,
        ] = await Promise.all([
          updateFinalActionIds.length > 0
            ? prisma.finalAction.count({
                where: { id: { in: updateFinalActionIds }, productId },
              })
            : Promise.resolve(0),
          request.body.runbookId
            ? prisma.runbook.findFirst({
                where: { id: request.body.runbookId, productId },
              })
            : Promise.resolve(null),
          updateResourceIds.length > 0
            ? prisma.resource.count({
                where: { id: { in: updateResourceIds }, productId },
              })
            : Promise.resolve(0),
          updateDownstreamIds.length > 0
            ? prisma.downstream.count({
                where: { id: { in: updateDownstreamIds }, productId },
              })
            : Promise.resolve(0),
        ]);

        if (
          updateFinalActionIds.length > 0 &&
          updateFinalActionCount !== updateFinalActionIds.length
        ) {
          return reply.status(400).send({
            error:
              "One or more final actions not found or do not belong to this product",
          });
        }
        if (request.body.runbookId && !updateRunbook) {
          return reply.status(400).send({
            error: "Runbook not found or does not belong to this product",
          });
        }
        if (
          updateResourceIds.length > 0 &&
          updateResourceCount !== updateResourceIds.length
        ) {
          return reply.status(400).send({
            error:
              "One or more resources not found or do not belong to this product",
          });
        }
        if (
          updateDownstreamIds.length > 0 &&
          updateDownstreamCount !== updateDownstreamIds.length
        ) {
          return reply.status(400).send({
            error:
              "One or more downstreams not found or do not belong to this product",
          });
        }

        const resolvedAnalysisType =
          request.body.analysisType ?? existing.analysisType;
        const resolvedIgnoreReasonCode =
          request.body.ignoreReasonCode !== undefined
            ? request.body.ignoreReasonCode
            : ((existing as Record<string, unknown>).ignoreReasonCode as
                | string
                | null
                | undefined);
        if (resolvedAnalysisType === "IGNORABLE" && !resolvedIgnoreReasonCode) {
          return HttpError.badRequest(
            reply,
            "ignoreReasonCode is required when analysisType is IGNORABLE",
          );
        }

        const runTransaction = () => prisma.$transaction(async (tx: TransactionClient) => {
          // Ordine di lock canonico: execution → eventi → analisi, lo stesso che
          // tengono `complete` e la review. Prendere l'analisi per prima — cioè
          // lasciare che sia l'`update` ad acquisirne il lock — invertirebbe
          // l'ordine rispetto al `complete` e aprirebbe un ciclo di attesa.
          //
          // `lastAppliedExecutionId` va letta prima di poterla bloccare, quindi
          // la si rilegge quando i lock sono tutti in mano: se è cambiata, il
          // lock preso sopra è su una execution che non è più il bersaglio.
          const before = await tx.alarmAnalysis.findUnique({
            where: { id },
            select: { lastAppliedExecutionId: true },
          });
          if (before === null) return null;
          if (before.lastAppliedExecutionId !== null) {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM automatic_runbook_executions WHERE id = ${before.lastAppliedExecutionId}::uuid FOR UPDATE`,
            );
          }
          // Gli eventi collegati sono il punto di sincronizzazione con il
          // `complete`, che tiene il lock sull'evento per tutta la
          // materializzazione: è qui che una riapplicazione in corso ci ferma.
          await tx.$queryRaw(Prisma.sql`SELECT id FROM alarm_events WHERE analysis_id = ${id}::uuid FOR UPDATE`);
          await tx.$queryRaw(Prisma.sql`SELECT id FROM alarm_analyses WHERE id = ${id}::uuid FOR UPDATE`);

          const locked = await tx.alarmAnalysis.findUnique({
            where: { id },
            select: { origin: true, lastAppliedExecutionId: true },
          });
          if (locked === null) return null;
          if (locked.lastAppliedExecutionId !== before.lastAppliedExecutionId) {
            throw new AnalysisConcurrencyConflict(
              "L'analisi è stata riapplicata mentre la modifica era in corso: ricarica e riprova",
            );
          }

          await assertProposalStillTheOneSeen(tx, locked.lastAppliedExecutionId, request.body.expectedLastAppliedExecutionId);

          if (request.body.resourceIds !== undefined) {
            await tx.analysisResource.deleteMany({ where: { analysisId: id } });
            if (request.body.resourceIds.length > 0) {
              await tx.analysisResource.createMany({
                data: request.body.resourceIds.map((resourceId) => ({
                  analysisId: id,
                  resourceId,
                })),
              });
            }
          }

          if (request.body.finalActionIds !== undefined) {
            await tx.analysisFinalAction.deleteMany({ where: { analysisId: id } });
            if (request.body.finalActionIds.length > 0) {
              await tx.analysisFinalAction.createMany({
                data: request.body.finalActionIds.map((finalActionId) => ({
                  analysisId: id,
                  finalActionId,
                })),
              });
            }
          }

          if (request.body.downstreamIds !== undefined) {
            await tx.analysisDownstream.deleteMany({ where: { analysisId: id } });
            if (request.body.downstreamIds.length > 0) {
              await tx.analysisDownstream.createMany({
                data: request.body.downstreamIds.map((downstreamId) => ({
                  analysisId: id,
                  downstreamId,
                })),
              });
            }
          }

          const updateData: Record<string, unknown> = {
            updatedById: request.user.userId,
          };

          // Prima modifica umana di un'analisi automatica: da qui in poi il dato è
          // ibrido e torna soggetto alle regole piene (§4.7). L'origine si legge
          // da `locked`, sotto lock: quella di `existing` è di prima della
          // transazione e un re-apply può averla riportata ad `AUTOMATIC`.
          if (locked.origin === AnalysisOrigins.AUTOMATIC) {
            updateData.origin = AnalysisOrigins.HYBRID;
          }

          if (request.body.analysisDate !== undefined) {
            updateData.analysisDate = new Date(request.body.analysisDate);
          }
          if (request.body.firstAlarmAt !== undefined) {
            updateData.firstAlarmAt = new Date(request.body.firstAlarmAt);
          }
          if (request.body.lastAlarmAt !== undefined) {
            updateData.lastAlarmAt = new Date(request.body.lastAlarmAt);
          }
          if (request.body.occurrences !== undefined) {
            updateData.occurrences = request.body.occurrences;
          }
          if (request.body.isOnCall !== undefined) {
            updateData.isOnCall = request.body.isOnCall;
          }
          if (request.body.analysisType !== undefined) {
            updateData.analysisType = request.body.analysisType;
          }
          if (request.body.status !== undefined) {
            updateData.status = request.body.status;
          }
          if (request.body.alarmId !== undefined) {
            updateData.alarmId = request.body.alarmId;
          }
          if (request.body.errorDetails !== undefined) {
            updateData.errorDetails = request.body.errorDetails || null;
          }
          if (request.body.conclusionNotes !== undefined) {
            updateData.conclusionNotes = request.body.conclusionNotes || null;
          }
          if (resolvedAnalysisType === "ANALYZABLE") {
            updateData.ignoreReasonCode = null;
            updateData.ignoreDetails = Prisma.DbNull;
          } else {
            if (request.body.ignoreReasonCode !== undefined) {
              updateData.ignoreReasonCode = request.body.ignoreReasonCode || null;
            }
            if (request.body.ignoreDetails !== undefined) {
              updateData.ignoreDetails =
                request.body.ignoreDetails != null
                  ? toJsonInput(request.body.ignoreDetails)
                  : Prisma.DbNull;
            }
          }
          if (request.body.operatorId !== undefined) {
            updateData.operatorId = request.body.operatorId;
          }
          if (request.body.environmentId !== undefined) {
            updateData.environmentId = request.body.environmentId;
          }
          if (request.body.runbookId !== undefined) {
            updateData.runbookId = request.body.runbookId || null;
          }
          if (request.body.links !== undefined) {
            updateData.links = processLinks(request.body.links);
          }
          if (request.body.trackingIds !== undefined) {
            updateData.trackingIds = request.body.trackingIds;
          }

          const updated = await tx.alarmAnalysis.update({
            where: { id },
            data: updateData,
            include: analysisInclude,
          });

          if (
            request.body.status === AnalysisStatuses.COMPLETED &&
            existing.status !== AnalysisStatuses.COMPLETED
          ) {
            await tx.alarmEvent.updateMany({
              where: { analysisId: id, resolvedAt: null },
              data: { resolvedAt: new Date() },
            });
          }

          // La modifica umana di una proposta ancora pendente è una conferma con
          // modifiche: chiude la review nella stessa transazione, così non resta
          // una decisione in sospeso su un contenuto che l'operatore ha già
          // riscritto (§4.8.3).
          //
          // Il bersaglio è **solo** la proposta corrente, letta da `updated` e
          // quindi dentro la transazione: `existing` è stato letto prima e un
          // re-apply concorrente può averla sostituita. Confermare tutte le
          // pendenti registrerebbe come approvate dall'operatore anche versioni
          // che non ha mai visto.
          const currentExecutionId = updated.lastAppliedExecutionId;
          if (currentExecutionId !== null) {
            // Compare-and-set su `PENDING`: fra la lettura e la scrittura la
            // review può essere stata decisa altrove, e uno stato finale è
            // immutabile.
            const confirmed = await tx.automaticRunbookExecution.updateMany({
              where: { id: currentExecutionId, reviewStatus: AutomationReviewStatuses.PENDING },
              data: {
                reviewStatus: AutomationReviewStatuses.CONFIRMED,
                reviewedByUserId: request.user.userId,
                reviewedByLabel: request.user.email ?? request.user.userId,
                reviewedAt: new Date(),
              },
            });
            if (confirmed.count === 1) {
              await tx.systemEvent.create({
                data: {
                  action: SystemEventActions.AUTOMATION_ANALYSIS_CONFIRMED,
                  resource: SystemEventResources.AUTOMATIC_RUNBOOK_EXECUTIONS,
                  resourceId: currentExecutionId,
                  userId: request.user.userId,
                  metadata: {
                    actorType: "HUMAN",
                    analysisId: id,
                    confirmationMode: "EDITED",
                  },
                },
              });
            }
          }

          // Eventuali proposte pendenti diverse da quella corrente non sono
          // state riviste da nessuno: l'analisi ora è `HYBRID` e la loro review
          // risponderebbe per sempre `REVIEW_TARGET_CHANGED`. Si chiudono come
          // superate, non come confermate.
          await supersedePendingReviews(
            tx,
            { analysisId: id },
            {
              reason: "HUMAN_ANALYSIS_EDIT",
              actorUserId: request.user.userId,
              ...(currentExecutionId === null ? {} : { exceptExecutionId: currentExecutionId }),
            },
          );

          return updated;
        });

        const analysis = await withTransactionRetry(runTransaction);
        // L'analisi è sparita fra il controllo dei permessi e i lock.
        if (analysis === null) {
          return HttpError.notFound(reply, "Analysis");
        }

        const eventBase = {
          resource: SystemEventResources.ALARM_ANALYSES,
          resourceId: analysis.id,
          resourceLabel: analysis.alarm?.name ?? null,
        } as const;

        const beforeResourceIds = existing.resources.map((row) => row.resourceId).sort();
        const afterResourceIds = analysis.resources.map((row) => row.resource.id).sort();
        const beforeDownstreamIds = existing.downstreams
          .map((row) => row.downstreamId)
          .sort();
        const afterDownstreamIds = analysis.downstreams
          .map((row) => row.downstream.id)
          .sort();
        const beforeFinalActionIds = existing.finalActions
          .map((row) => row.finalActionId)
          .sort();
        const afterFinalActionIds = analysis.finalActions
          .map((row) => row.finalAction.id)
          .sort();
        const beforeLinks = Array.isArray(existing.links) ? existing.links : [];
        const afterLinks = Array.isArray(analysis.links) ? analysis.links : [];
        const beforeTrackingIds = Array.isArray(existing.trackingIds)
          ? existing.trackingIds
          : [];
        const afterTrackingIds = Array.isArray(analysis.trackingIds)
          ? analysis.trackingIds
          : [];

        request.auditEvents.push({
          action: SystemEventActions.ANALYSIS_UPDATED,
          ...eventBase,
          metadata: {
            productId: analysis.productId,
            changes: buildDiff(
              {
                analysisType: existing.analysisType,
                status: existing.status,
                analysisDate: existing.analysisDate,
                occurrences: existing.occurrences,
                isOnCall: existing.isOnCall,
                operatorId: existing.operatorId,
                environmentId: existing.environmentId,
                alarmId: existing.alarmId,
                runbookId: existing.runbookId,
                ignoreReasonCode: (existing as Record<string, unknown>).ignoreReasonCode,
                errorDetails: existing.errorDetails,
                conclusionNotes: existing.conclusionNotes,
                resourceIds: beforeResourceIds,
                downstreamIds: beforeDownstreamIds,
                finalActionIds: beforeFinalActionIds,
                links: beforeLinks,
                trackingIds: beforeTrackingIds,
              } as Record<string, unknown>,
              {
                analysisType: analysis.analysisType,
                status: analysis.status,
                analysisDate: analysis.analysisDate,
                occurrences: analysis.occurrences,
                isOnCall: analysis.isOnCall,
                operatorId: analysis.operatorId,
                environmentId: analysis.environmentId,
                alarmId: analysis.alarmId,
                runbookId: analysis.runbookId,
                ignoreReasonCode: (analysis as Record<string, unknown>).ignoreReasonCode,
                errorDetails: analysis.errorDetails,
                conclusionNotes: analysis.conclusionNotes,
                resourceIds: afterResourceIds,
                downstreamIds: afterDownstreamIds,
                finalActionIds: afterFinalActionIds,
                links: afterLinks,
                trackingIds: afterTrackingIds,
              } as Record<string, unknown>,
            ),
          },
        });

        if (
          request.body.status !== undefined &&
          request.body.status !== existing.status
        ) {
          request.auditEvents.push({
            action: SystemEventActions.ANALYSIS_STATUS_CHANGED,
            ...eventBase,
            metadata: {
              productId: analysis.productId,
              previousStatus: existing.status,
              newStatus: request.body.status,
            },
          });
        }

        reply.send(formatAnalysisResponse(analysis));
        scoreAnalysis(analysis.id, prisma).catch((err) => {
          fastify.log.error(
            { err, analysisId: analysis.id },
            "Failed to score analysis after update",
          );
        });
      } catch (error) {
        // Prima del ramo generico: un conflitto di concorrenza non è una
        // richiesta malformata e non va degradato a 400.
        if (error instanceof AnalysisConcurrencyConflict) {
          return HttpError.conflict(reply, error.detail);
        }
        const message =
          error instanceof Error ? error.message : "Failed to update analysis";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Analysis");
        }
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.delete<{ Params: AlarmAnalysisParams }>(
    "/products/:productId/analyses/:id",
    {
      config: { rateLimit: false },
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Delete an analysis",
        security: [{ bearerAuth: [] }],
        params: AlarmAnalysisParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existing = await prisma.alarmAnalysis.findFirst({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        if (!existing) {
          return HttpError.notFound(reply, "Analysis");
        }

        const deleteScope = await getPermissionScope(
          request.user.userId,
          SystemComponent.ALARM_ANALYSIS,
          "delete",
        );
        const canDeleteThis =
          deleteScope === PermissionScope.ALL ||
          (deleteScope === PermissionScope.OWN &&
            existing.createdById === request.user.userId);
        if (!canDeleteThis) {
          return HttpError.forbidden(reply);
        }

        if (deleteScope === PermissionScope.OWN) {
          const lockSetting = await prisma.systemSetting.findUnique({
            where: { key: "analysis_edit_lock_days" },
          });
          const lockDays =
            typeof lockSetting?.value === "number" ? lockSetting.value : 7;
          const daysSince = Math.floor(
            (Date.now() - existing.createdAt.getTime()) / 86_400_000,
          );
          if (daysSince >= lockDays) {
            return reply.status(403).send({
              error: `L'analisi non può più essere eliminata (blocco dopo ${lockDays} giorni dalla creazione)`,
            });
          }
        }

        // La FK `AutomaticRunbookExecution.analysisId` è `SetNull`: cancellare
        // l'analisi lascia la review pendente senza bersaglio, e da lì ogni
        // decisione risponde `REVIEW_NOT_APPLICABLE` — una voce in coda che
        // nessuna azione umana può più togliere (§4.8.2). Chiusura e delete nella
        // stessa transazione, altrimenti un fallimento lascerebbe i due stati
        // disallineati.
        await prisma.$transaction(async (tx: TransactionClient) => {
          await supersedePendingReviews(
            tx,
            { analysisId: request.params.id },
            {
              reason: "HUMAN_ANALYSIS_DELETE",
              actorUserId: request.user.userId,
            },
          );
          await tx.alarmAnalysis.delete({ where: { id: request.params.id } });
        });

        request.auditEvents.push({
          action: SystemEventActions.ANALYSIS_DELETED,
          resource: SystemEventResources.ALARM_ANALYSES,
          resourceId: request.params.id,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Analysis deleted successfully" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete analysis";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Analysis");
        }
        HttpError.internal(reply, message);
      }
    },
  );
}

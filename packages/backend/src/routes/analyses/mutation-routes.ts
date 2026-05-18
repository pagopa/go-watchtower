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
} from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { getPermissionScope } from "../../services/permission.service.js";
import { scoreAnalysis } from "../../services/analysis-scoring.service.js";
import { buildDiff } from "../../services/system-event.service.js";
import { HttpError } from "../../utils/http-errors.js";
import { toJsonInput } from "../../utils/json-cast.js";
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

        const analysis = await prisma.$transaction(async (tx: TransactionClient) => {
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

          return updated;
        });

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

        await prisma.alarmAnalysis.delete({ where: { id: request.params.id } });

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

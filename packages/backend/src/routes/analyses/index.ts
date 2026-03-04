import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, Resource, PermissionScope, type PrismaClient } from "@go-watchtower/database";

type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
import { hasPermission, getPermissionScope } from "../../services/permission.service.js";
import { buildDiff } from "../../services/system-event.service.js";
import { scoreAnalysis } from "../../services/analysis-scoring.service.js";
import { SystemEventActions, SystemEventResources, inferLinkType } from "@go-watchtower/shared";
import {
  ProductIdParamsSchema,
  AlarmAnalysisParamsSchema,
  AlarmAnalysisQuerySchema,
  AllAnalysesQuerySchema,
  AnalysisStatsQuerySchema,
  AnalysisStatsResponseSchema,
  AnalysisAuthorsResponseSchema,
  CreateAlarmAnalysisBodySchema,
  UpdateAlarmAnalysisBodySchema,
  AlarmAnalysisResponseSchema,
  PaginatedAlarmAnalysisResponseSchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  IgnoreReasonsResponseSchema,
  AnalysisPolicyResponseSchema,
  type ProductIdParams,
  type AlarmAnalysisParams,
  type AlarmAnalysisQuery,
  type AllAnalysesQuery,
  type AnalysisStatsQuery,
  type CreateAlarmAnalysisBody,
  type UpdateAlarmAnalysisBody,
} from "./schemas.js";

function processLinks(links?: Array<{ url: string; name?: string; type?: string }>): Array<{ url: string; name?: string; type: string }> {
  if (!links) return [];
  return links.map((link) => ({
    ...link,
    type: link.type || inferLinkType(link.url),
  }));
}

// Prisma include clause for all relations
const analysisInclude = {
  product: { select: { id: true, name: true } },
  alarm: { select: { id: true, name: true } },
  operator: { select: { id: true, name: true, email: true } },
  environment: { select: { id: true, name: true } },
  finalActions: {
    include: { finalAction: { select: { id: true, name: true } } },
  },
  runbook: { select: { id: true, name: true, link: true, status: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  microservices: {
    include: { microservice: { select: { id: true, name: true } } },
  },
  downstreams: {
    include: { downstream: { select: { id: true, name: true } } },
  },
  ignoreReason: true,
} as const;

type AnalysisWithRelations = Prisma.AlarmAnalysisGetPayload<{
  include: typeof analysisInclude;
}>;

function formatAnalysisResponse(analysis: AnalysisWithRelations) {
  return {
    id: analysis.id,
    analysisDate: analysis.analysisDate.toISOString(),
    firstAlarmAt: analysis.firstAlarmAt.toISOString(),
    lastAlarmAt: analysis.lastAlarmAt.toISOString(),
    occurrences: analysis.occurrences,
    isOnCall: analysis.isOnCall,
    analysisType: analysis.analysisType,
    status: analysis.status,
    alarmId: analysis.alarmId,
    errorDetails: analysis.errorDetails,
    conclusionNotes: analysis.conclusionNotes,
    ignoreReasonCode: analysis.ignoreReasonCode,
    ignoreDetails: analysis.ignoreDetails as Record<string, unknown> | null,
    ignoreReason: analysis.ignoreReason ?? null,
    operatorId: analysis.operatorId,
    productId: analysis.productId,
    environmentId: analysis.environmentId,
    runbookId: analysis.runbookId,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    createdById: analysis.createdById,
    updatedById: analysis.updatedById,
    product: analysis.product,
    alarm: analysis.alarm,
    operator: analysis.operator,
    environment: analysis.environment,
    finalActions: analysis.finalActions.map(
      (fa: { finalAction: { id: string; name: string } }) => fa.finalAction
    ),
    runbook: analysis.runbook,
    createdBy: analysis.createdBy,
    updatedBy: analysis.updatedBy,
    microservices: analysis.microservices.map(
      (m: { microservice: { id: string; name: string } }) => m.microservice
    ),
    downstreams: analysis.downstreams.map(
      (d: { downstream: { id: string; name: string } }) => d.downstream
    ),
    links: Array.isArray(analysis.links) ? analysis.links : [],
    trackingIds: Array.isArray(analysis.trackingIds) ? analysis.trackingIds : [],
    validationScore: analysis.validationScore ?? null,
    qualityScore:    analysis.qualityScore ?? null,
    scoredAt:        analysis.scoredAt ? analysis.scoredAt.toISOString() : null,
  };
}

function buildAnalysisWhereClause(
  query: AlarmAnalysisQuery | AllAnalysesQuery,
  productId?: string
): Prisma.AlarmAnalysisWhereInput {
  const where: Prisma.AlarmAnalysisWhereInput = {};

  if (productId) where.productId = productId;
  else if ("productId" in query && query.productId) where.productId = query.productId;

  if (query.analysisType) where.analysisType = query.analysisType;
  if (query.status) where.status = query.status;
  if (query.isOnCall !== undefined) where.isOnCall = query.isOnCall;
  if (query.operatorId) where.operatorId = query.operatorId;
  if (query.environmentId) where.environmentId = query.environmentId;
  if (query.alarmId) where.alarmId = query.alarmId;
  if (query.finalActionId) where.finalActions = { some: { finalActionId: query.finalActionId } };
  if (query.dateFrom || query.dateTo) {
    where.analysisDate = {};
    if (query.dateFrom) where.analysisDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.analysisDate.lte = new Date(query.dateTo);
  }
  if (query.ignoreReasonCode) where.ignoreReasonCode = query.ignoreReasonCode;
  if (query.runbookId) where.runbookId = query.runbookId;
  if (query.microserviceId) where.microservices = { some: { microserviceId: query.microserviceId } };
  if (query.downstreamId) where.downstreams = { some: { downstreamId: query.downstreamId } };
  if (query.traceId) {
    // PostgreSQL JSONB @> containment: check if trackingIds array contains
    // an object with the given traceId. Prisma maps array_contains to @>.
    where.trackingIds = { array_contains: [{ traceId: query.traceId }] };
  }
  if (query.search) {
    where.OR = [
      { errorDetails: { contains: query.search, mode: "insensitive" } },
      { conclusionNotes: { contains: query.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function analysisRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // ============================================================================
  // GET IGNORE REASONS
  // ============================================================================

  app.get(
    "/analyses/ignore-reasons",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get all ignore reasons ordered by sort_order",
        security: [{ bearerAuth: [] }],
        response: {
          200: IgnoreReasonsResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const ignoreReasons = await prisma.ignoreReason.findMany({
        orderBy: { sortOrder: "asc" },
      });
      reply.send(
        ignoreReasons.map((r) => ({
          ...r,
          detailsSchema: r.detailsSchema as Record<string, unknown> | null,
        }))
      );
    }
  );

  // ============================================================================
  // GET ANALYSES POLICY
  // Returns policy settings relevant to analyses (e.g. edit lock days).
  // Accessible to any authenticated user — no SYSTEM_SETTING permission required.
  // ============================================================================

  app.get(
    "/analyses/policy",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get analysis policy settings (e.g. edit lock days)",
        security: [{ bearerAuth: [] }],
        response: {
          200: AnalysisPolicyResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "analysis_edit_lock_days" },
      });
      const editLockDays = typeof setting?.value === "number" ? setting.value : 7;
      return reply.send({ editLockDays });
    }
  );

  // ============================================================================
  // LIST ANALYSES (with advanced pagination and filtering)
  // ============================================================================

  app.get<{ Params: ProductIdParams; Querystring: AlarmAnalysisQuery }>(
    "/products/:productId/analyses",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get all analyses for a product with pagination and filtering",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        querystring: AlarmAnalysisQuerySchema,
        response: {
          200: PaginatedAlarmAnalysisResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "read"
        );
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Verify product exists
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        const {
          page = 1,
          pageSize = 20,
          sortBy = "analysisDate",
          sortOrder = "desc",
        } = request.query;

        const where = buildAnalysisWhereClause(request.query, request.params.productId);

        const skip = (page - 1) * pageSize;

        const [analyses, totalItems] = await Promise.all([
          prisma.alarmAnalysis.findMany({
            where,
            include: analysisInclude,
            orderBy: { [sortBy]: sortOrder },
            skip,
            take: pageSize,
          }),
          prisma.alarmAnalysis.count({ where }),
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);

        reply.send({
          data: analyses.map(formatAnalysisResponse),
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch analyses";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // LIST ALL ANALYSES (cross-product, with optional productId filter)
  // ============================================================================

  app.get<{ Querystring: AllAnalysesQuery }>(
    "/analyses",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get all analyses across products with pagination and filtering",
        security: [{ bearerAuth: [] }],
        querystring: AllAnalysesQuerySchema,
        response: {
          200: PaginatedAlarmAnalysisResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "read"
        );
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const {
          page = 1,
          pageSize = 20,
          sortBy = "analysisDate",
          sortOrder = "desc",
        } = request.query;

        const where = buildAnalysisWhereClause(request.query);

        const skip = (page - 1) * pageSize;

        const [analyses, totalItems] = await Promise.all([
          prisma.alarmAnalysis.findMany({
            where,
            include: analysisInclude,
            orderBy: { [sortBy]: sortOrder },
            skip,
            take: pageSize,
          }),
          prisma.alarmAnalysis.count({ where }),
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);

        reply.send({
          data: analyses.map(formatAnalysisResponse),
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch analyses";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // GET SINGLE ANALYSIS
  // ============================================================================

  app.get<{ Params: AlarmAnalysisParams }>(
    "/products/:productId/analyses/:id",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get an analysis by ID",
        security: [{ bearerAuth: [] }],
        params: AlarmAnalysisParamsSchema,
        response: {
          200: AlarmAnalysisResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "read"
        );
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const analysis = await prisma.alarmAnalysis.findFirst({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          include: analysisInclude,
        });

        if (!analysis) {
          return reply.status(404).send({ error: "Analysis not found" });
        }

        reply.send(formatAnalysisResponse(analysis));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch analysis";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // CREATE ANALYSIS
  // ============================================================================

  app.post<{ Params: ProductIdParams; Body: CreateAlarmAnalysisBody }>(
    "/products/:productId/analyses",
    {
      onRequest: [app.authenticate],
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
        const canWrite = await hasPermission(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "write"
        );
        if (!canWrite) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const { productId } = request.params;

        // Verify product, operator, alarm, and environment in parallel
        const [product, operator, alarm, environment] = await Promise.all([
          prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
          prisma.user.findUnique({ where: { id: request.body.operatorId } }),
          prisma.alarm.findFirst({ where: { id: request.body.alarmId, productId } }),
          prisma.environment.findFirst({ where: { id: request.body.environmentId, productId } }),
        ]);

        if (!product) {
          return reply.status(404).send({ error: "Product not found" });
        }

        if (!operator) {
          return reply.status(400).send({ error: "Operator not found" });
        }

        if (!alarm) {
          return reply
            .status(400)
            .send({ error: "Alarm not found or does not belong to this product" });
        }

        if (!environment) {
          return reply
            .status(400)
            .send({ error: "Environment not found or does not belong to this product" });
        }

        // Verify optional related entities in parallel
        const finalActionIds = request.body.finalActionIds ?? [];
        const microserviceIds = request.body.microserviceIds ?? [];
        const downstreamIds = request.body.downstreamIds ?? [];

        const [finalActionCount, runbook, microserviceCount, downstreamCount] = await Promise.all([
          finalActionIds.length > 0
            ? prisma.finalAction.count({ where: { id: { in: finalActionIds }, productId } })
            : Promise.resolve(0),
          request.body.runbookId
            ? prisma.runbook.findFirst({ where: { id: request.body.runbookId, productId } })
            : Promise.resolve(null),
          microserviceIds.length > 0
            ? prisma.microservice.count({ where: { id: { in: microserviceIds }, productId } })
            : Promise.resolve(0),
          downstreamIds.length > 0
            ? prisma.downstream.count({ where: { id: { in: downstreamIds }, productId } })
            : Promise.resolve(0),
        ]);

        if (finalActionIds.length > 0 && finalActionCount !== finalActionIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more final actions not found or do not belong to this product" });
        }

        if (request.body.runbookId && !runbook) {
          return reply
            .status(400)
            .send({ error: "Runbook not found or does not belong to this product" });
        }

        if (microserviceIds.length > 0 && microserviceCount !== microserviceIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more microservices not found or do not belong to this product" });
        }

        if (downstreamIds.length > 0 && downstreamCount !== downstreamIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more downstreams not found or do not belong to this product" });
        }

        const { ignoreReasonCode, ignoreDetails } = request.body;
        const resolvedAnalysisType = request.body.analysisType ?? "ANALYZABLE";

        if (resolvedAnalysisType === "IGNORABLE" && !ignoreReasonCode) {
          return reply.status(400).send({ error: "ignoreReasonCode is required when analysisType is IGNORABLE" });
        }

        const analysis = await prisma.$transaction(async (tx: TransactionClient) => {
          const created = await tx.alarmAnalysis.create({
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
              ignoreReasonCode: resolvedAnalysisType === "IGNORABLE" ? ignoreReasonCode ?? null : null,
              ignoreDetails: resolvedAnalysisType === "IGNORABLE"
                ? (ignoreDetails != null ? ignoreDetails as unknown as Prisma.InputJsonValue : Prisma.DbNull)
                : Prisma.DbNull,
              operatorId: request.body.operatorId,
              productId,
              environmentId: request.body.environmentId,
              runbookId: request.body.runbookId || null,
              links: processLinks(request.body.links),
              trackingIds: request.body.trackingIds ?? [],
              createdById: request.user.userId,
              finalActions:
                request.body.finalActionIds && request.body.finalActionIds.length > 0
                  ? {
                      createMany: {
                        data: request.body.finalActionIds.map((finalActionId) => ({
                          finalActionId,
                        })),
                      },
                    }
                  : undefined,
              microservices:
                request.body.microserviceIds && request.body.microserviceIds.length > 0
                  ? {
                      createMany: {
                        data: request.body.microserviceIds.map((microserviceId) => ({
                          microserviceId,
                        })),
                      },
                    }
                  : undefined,
              downstreams:
                request.body.downstreamIds && request.body.downstreamIds.length > 0
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

          return created;
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
          fastify.log.error({ err, analysisId: analysis.id }, "Failed to score analysis after create");
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create analysis";
        reply.status(400).send({ error: message });
      }
    }
  );

  // ============================================================================
  // UPDATE ANALYSIS
  // ============================================================================

  app.put<{ Params: AlarmAnalysisParams; Body: UpdateAlarmAnalysisBody }>(
    "/products/:productId/analyses/:id",
    {
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

        // Verify analysis exists and belongs to product
        // Include relational data for diffing in audit events
        const existing = await prisma.alarmAnalysis.findFirst({
          where: { id, productId },
          include: {
            microservices: { select: { microserviceId: true } },
            downstreams:   { select: { downstreamId: true } },
            finalActions:  { select: { finalActionId: true } },
          },
        });

        if (!existing) {
          return reply.status(404).send({ error: "Analysis not found" });
        }

        // Scope-aware ownership check: ALL can edit any, OWN only own, NONE denied.
        // Resolved once to avoid a second DB round-trip for the lock check below.
        const writeScope = await getPermissionScope(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "write"
        );
        const canWriteForThis =
          writeScope === PermissionScope.ALL ||
          (writeScope === PermissionScope.OWN && existing.createdById === request.user.userId);
        if (!canWriteForThis) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Lock check: users with OWN write scope cannot edit analyses older than the configured threshold.
        if (writeScope === PermissionScope.OWN) {
          const lockSetting = await prisma.systemSetting.findUnique({ where: { key: "analysis_edit_lock_days" } });
          const lockDays = typeof lockSetting?.value === "number" ? lockSetting.value : 7;
          const daysSince = Math.floor((Date.now() - existing.createdAt.getTime()) / 86_400_000);
          if (daysSince >= lockDays) {
            return reply.status(403).send({
              error: `L'analisi non può più essere modificata (blocco dopo ${lockDays} giorni dalla creazione)`,
            });
          }
        }

        // Verify operator, alarm, and environment in parallel (all independent)
        const [operator, alarm, environment] = await Promise.all([
          request.body.operatorId
            ? prisma.user.findUnique({ where: { id: request.body.operatorId } })
            : Promise.resolve(true),
          request.body.alarmId
            ? prisma.alarm.findFirst({ where: { id: request.body.alarmId, productId } })
            : Promise.resolve(true),
          request.body.environmentId
            ? prisma.environment.findFirst({ where: { id: request.body.environmentId, productId } })
            : Promise.resolve(true),
        ]);

        if (request.body.operatorId && !operator) {
          return reply.status(400).send({ error: "Operator not found" });
        }

        if (request.body.alarmId && !alarm) {
          return reply
            .status(400)
            .send({ error: "Alarm not found or does not belong to this product" });
        }

        if (request.body.environmentId && !environment) {
          return reply
            .status(400)
            .send({ error: "Environment not found or does not belong to this product" });
        }

        // Verify optional related entities in parallel
        const updateFinalActionIds = request.body.finalActionIds ?? [];
        const updateMicroserviceIds = request.body.microserviceIds ?? [];
        const updateDownstreamIds = request.body.downstreamIds ?? [];

        const [updateFinalActionCount, updateRunbook, updateMicroserviceCount, updateDownstreamCount] = await Promise.all([
          updateFinalActionIds.length > 0
            ? prisma.finalAction.count({ where: { id: { in: updateFinalActionIds }, productId } })
            : Promise.resolve(0),
          request.body.runbookId
            ? prisma.runbook.findFirst({ where: { id: request.body.runbookId, productId } })
            : Promise.resolve(null),
          updateMicroserviceIds.length > 0
            ? prisma.microservice.count({ where: { id: { in: updateMicroserviceIds }, productId } })
            : Promise.resolve(0),
          updateDownstreamIds.length > 0
            ? prisma.downstream.count({ where: { id: { in: updateDownstreamIds }, productId } })
            : Promise.resolve(0),
        ]);

        if (updateFinalActionIds.length > 0 && updateFinalActionCount !== updateFinalActionIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more final actions not found or do not belong to this product" });
        }

        if (request.body.runbookId && !updateRunbook) {
          return reply
            .status(400)
            .send({ error: "Runbook not found or does not belong to this product" });
        }

        if (updateMicroserviceIds.length > 0 && updateMicroserviceCount !== updateMicroserviceIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more microservices not found or do not belong to this product" });
        }

        if (updateDownstreamIds.length > 0 && updateDownstreamCount !== updateDownstreamIds.length) {
          return reply
            .status(400)
            .send({ error: "One or more downstreams not found or do not belong to this product" });
        }

        // Validate ignoreReasonCode when analysisType is IGNORABLE
        const resolvedAnalysisType = request.body.analysisType ?? existing.analysisType;
        const resolvedIgnoreReasonCode = request.body.ignoreReasonCode !== undefined
          ? request.body.ignoreReasonCode
          : (existing as Record<string, unknown>).ignoreReasonCode as string | null | undefined;
        if (resolvedAnalysisType === "IGNORABLE" && !resolvedIgnoreReasonCode) {
          return reply.status(400).send({ error: "ignoreReasonCode is required when analysisType is IGNORABLE" });
        }

        const analysis = await prisma.$transaction(async (tx: TransactionClient) => {
          // Handle microservices replacement
          if (request.body.microserviceIds !== undefined) {
            await tx.analysisMicroservice.deleteMany({
              where: { analysisId: id },
            });

            if (request.body.microserviceIds.length > 0) {
              await tx.analysisMicroservice.createMany({
                data: request.body.microserviceIds.map((microserviceId) => ({
                  analysisId: id,
                  microserviceId,
                })),
              });
            }
          }

          // Handle final actions replacement
          if (request.body.finalActionIds !== undefined) {
            await tx.analysisFinalAction.deleteMany({
              where: { analysisId: id },
            });

            if (request.body.finalActionIds.length > 0) {
              await tx.analysisFinalAction.createMany({
                data: request.body.finalActionIds.map((finalActionId) => ({
                  analysisId: id,
                  finalActionId,
                })),
              });
            }
          }

          // Handle downstreams replacement
          if (request.body.downstreamIds !== undefined) {
            await tx.analysisDownstream.deleteMany({
              where: { analysisId: id },
            });

            if (request.body.downstreamIds.length > 0) {
              await tx.analysisDownstream.createMany({
                data: request.body.downstreamIds.map((downstreamId) => ({
                  analysisId: id,
                  downstreamId,
                })),
              });
            }
          }

          // Build update data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateData: Record<string, any> = {
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
              updateData.ignoreDetails = request.body.ignoreDetails != null
                ? request.body.ignoreDetails as unknown as Prisma.InputJsonValue
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

          return updated;
        });

        const eventBase = {
          resource: SystemEventResources.ALARM_ANALYSES,
          resourceId: analysis.id,
          resourceLabel: analysis.alarm?.name ?? null,
        } as const;

        // Build before/after snapshots for relational fields
        const beforeMicroserviceIds = existing.microservices.map(m => m.microserviceId).sort();
        const afterMicroserviceIds  = analysis.microservices.map((m: { microservice: { id: string } }) => m.microservice.id).sort();

        const beforeDownstreamIds = existing.downstreams.map(d => d.downstreamId).sort();
        const afterDownstreamIds  = analysis.downstreams.map((d: { downstream: { id: string } }) => d.downstream.id).sort();

        const beforeFinalActionIds = existing.finalActions.map(fa => fa.finalActionId).sort();
        const afterFinalActionIds  = analysis.finalActions.map((fa: { finalAction: { id: string } }) => fa.finalAction.id).sort();

        const beforeLinks       = Array.isArray(existing.links) ? existing.links : [];
        const afterLinks        = Array.isArray(analysis.links) ? analysis.links : [];

        const beforeTrackingIds = Array.isArray(existing.trackingIds) ? existing.trackingIds : [];
        const afterTrackingIds  = Array.isArray(analysis.trackingIds) ? analysis.trackingIds : [];

        request.auditEvents.push({
          action: SystemEventActions.ANALYSIS_UPDATED,
          ...eventBase,
          metadata: {
            productId: analysis.productId,
            changes: buildDiff(
              {
                analysisType:    existing.analysisType,
                status:          existing.status,
                analysisDate:    existing.analysisDate,
                occurrences:     existing.occurrences,
                isOnCall:        existing.isOnCall,
                operatorId:      existing.operatorId,
                environmentId:   existing.environmentId,
                alarmId:         existing.alarmId,
                runbookId:       existing.runbookId,
                ignoreReasonCode: (existing as Record<string, unknown>).ignoreReasonCode,
                errorDetails:    existing.errorDetails,
                conclusionNotes: existing.conclusionNotes,
                microserviceIds: beforeMicroserviceIds,
                downstreamIds:   beforeDownstreamIds,
                finalActionIds:  beforeFinalActionIds,
                links:           beforeLinks,
                trackingIds:     beforeTrackingIds,
              } as Record<string, unknown>,
              {
                analysisType:    analysis.analysisType,
                status:          analysis.status,
                analysisDate:    analysis.analysisDate,
                occurrences:     analysis.occurrences,
                isOnCall:        analysis.isOnCall,
                operatorId:      analysis.operatorId,
                environmentId:   analysis.environmentId,
                alarmId:         analysis.alarmId,
                runbookId:       analysis.runbookId,
                ignoreReasonCode: (analysis as Record<string, unknown>).ignoreReasonCode,
                errorDetails:    analysis.errorDetails,
                conclusionNotes: analysis.conclusionNotes,
                microserviceIds: afterMicroserviceIds,
                downstreamIds:   afterDownstreamIds,
                finalActionIds:  afterFinalActionIds,
                links:           afterLinks,
                trackingIds:     afterTrackingIds,
              } as Record<string, unknown>,
            ),
          },
        });

        if (request.body.status !== undefined && request.body.status !== existing.status) {
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
          fastify.log.error({ err, analysisId: analysis.id }, "Failed to score analysis after update");
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to update analysis";
        if (message.includes("Record to update not found")) {
          return reply.status(404).send({ error: "Analysis not found" });
        }
        reply.status(400).send({ error: message });
      }
    }
  );

  // ============================================================================
  // ANALYSIS AUTHORS (users who created at least one analysis)
  // ============================================================================

  app.get(
    "/analyses/authors",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get distinct users who created at least one analysis",
        security: [{ bearerAuth: [] }],
        response: {
          200: AnalysisAuthorsResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "read"
        );
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const authors = await prisma.user.findMany({
          where: {
            analyses: { some: {} },
          },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        });

        reply.send(authors);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch authors";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // ANALYSIS STATS (aggregated data for dashboard)
  // ============================================================================

  app.get<{ Querystring: AnalysisStatsQuery }>(
    "/analyses/stats",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get aggregated analysis statistics for dashboard",
        security: [{ bearerAuth: [] }],
        querystring: AnalysisStatsQuerySchema,
        response: {
          200: AnalysisStatsResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "read"
        );
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const { productId, dateFrom, dateTo } = request.query;

        // Build base where clause
        const where: Prisma.AlarmAnalysisWhereInput = {};
        if (productId) where.productId = productId;
        if (dateFrom || dateTo) {
          where.analysisDate = {};
          if (dateFrom) where.analysisDate.gte = new Date(dateFrom);
          if (dateTo) where.analysisDate.lte = new Date(dateTo);
        }

        // KPI: totals for current period
        const [totalAnalyses, occurrencesAgg] = await Promise.all([
          prisma.alarmAnalysis.count({ where }),
          prisma.alarmAnalysis.aggregate({ where, _sum: { occurrences: true } }),
        ]);
        const totalOccurrences = occurrencesAgg._sum.occurrences || 0;

        // KPI: previous period (same duration shifted back)
        let totalAnalysesPrevious = 0;
        let totalOccurrencesPrevious = 0;
        if (dateFrom && dateTo) {
          const from = new Date(dateFrom);
          const to = new Date(dateTo);
          const duration = to.getTime() - from.getTime();
          const prevFrom = new Date(from.getTime() - duration);
          const prevTo = new Date(from.getTime());
          const prevWhere: Prisma.AlarmAnalysisWhereInput = {
            ...where,
            analysisDate: { gte: prevFrom, lte: prevTo },
          };
          const [prevCount, prevAgg] = await Promise.all([
            prisma.alarmAnalysis.count({ where: prevWhere }),
            prisma.alarmAnalysis.aggregate({ where: prevWhere, _sum: { occurrences: true } }),
          ]);
          totalAnalysesPrevious = prevCount;
          totalOccurrencesPrevious = prevAgg._sum.occurrences || 0;
        }

        // Compute daily date range (needed for dailyRaw query)
        const now = new Date();
        const dailyFrom = dateFrom
          ? new Date(dateFrom)
          : new Date(now.getFullYear(), now.getMonth(), 1);
        const dailyTo = dateTo ? new Date(dateTo) : now;

        // All aggregation queries are independent — run in parallel
        const [
          topFinalActionRaw,
          byProdEnvRaw,
          byOpRaw,
          byTypeRaw,
          topAlarmsRaw,
          dailyRaw,
          onCallRaw,
        ] = await Promise.all([
          prisma.analysisFinalAction.groupBy({
            by: ["finalActionId"],
            where: { analysis: where },
            _count: { finalActionId: true },
            orderBy: { _count: { finalActionId: "desc" } },
            take: 1,
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["productId", "environmentId"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["operatorId"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["analysisType"],
            where,
            _count: { id: true },
          }),
          prisma.alarmAnalysis.groupBy({
            by: ["alarmId"],
            where,
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 10,
          }),
          prisma.$queryRawUnsafe<
            Array<{ date: string; environment_id: string; count: bigint; total_occurrences: bigint }>
          >(
            `SELECT DATE(analysis_date) as date, environment_id, COUNT(*)::bigint as count, COALESCE(SUM(occurrences), 0)::bigint as total_occurrences
             FROM alarm_analyses
             WHERE analysis_date >= $1 AND analysis_date <= $2
             ${productId ? "AND product_id = $3" : ""}
             GROUP BY DATE(analysis_date), environment_id
             ORDER BY date ASC`,
            ...(productId ? [dailyFrom, dailyTo, productId] : [dailyFrom, dailyTo])
          ),
          prisma.$queryRawUnsafe<
            Array<{ month: string; is_on_call: boolean; count: bigint }>
          >(
            `SELECT TO_CHAR(analysis_date, 'YYYY-MM') as month, is_on_call, COUNT(*)::bigint as count
             FROM alarm_analyses
             WHERE 1=1
             ${productId ? "AND product_id = $1" : ""}
             ${dateFrom ? `AND analysis_date >= $${productId ? 2 : 1}` : ""}
             ${dateTo ? `AND analysis_date <= $${(productId ? 1 : 0) + (dateFrom ? 1 : 0) + 1}` : ""}
             GROUP BY month, is_on_call
             ORDER BY month ASC`,
            ...[productId, dateFrom ? new Date(dateFrom) : undefined, dateTo ? new Date(dateTo) : undefined].filter(
              (v) => v !== undefined
            )
          ),
        ]);

        // Name resolution queries — depend on aggregation results, parallelized among themselves
        const productIds = [...new Set(byProdEnvRaw.map((r: { productId: string }) => r.productId))];
        const environmentIds = [...new Set(byProdEnvRaw.map((r: { environmentId: string }) => r.environmentId))];
        const operatorIds = byOpRaw.map((r: { operatorId: string }) => r.operatorId);
        const alarmIds = topAlarmsRaw.map((r: { alarmId: string }) => r.alarmId);
        const dailyEnvIds = [...new Set(dailyRaw.map((r: { environment_id: string }) => r.environment_id))];
        const topFaEntry = topFinalActionRaw[0];

        const [products, environments, operators, alarms, dailyEnvs, topFinalActionEntity] = await Promise.all([
          prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }),
          prisma.environment.findMany({ where: { id: { in: environmentIds } }, select: { id: true, name: true } }),
          prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, name: true } }),
          alarmIds.length > 0
            ? prisma.alarm.findMany({ where: { id: { in: alarmIds } }, select: { id: true, name: true } })
            : Promise.resolve([]),
          dailyEnvIds.length > 0
            ? prisma.environment.findMany({ where: { id: { in: dailyEnvIds } }, select: { id: true, name: true } })
            : Promise.resolve([]),
          topFaEntry
            ? prisma.finalAction.findUnique({ where: { id: topFaEntry.finalActionId }, select: { id: true, name: true } })
            : Promise.resolve(null),
        ]);

        // Build lookup maps
        const productMap = new Map(products.map((p: { id: string; name: string }) => [p.id, p.name]));
        const envMap = new Map(environments.map((e: { id: string; name: string }) => [e.id, e.name]));
        const opMap = new Map(operators.map((o: { id: string; name: string }) => [o.id, o.name]));
        const alarmMap = new Map(alarms.map((a: { id: string; name: string }) => [a.id, a.name]));
        const dailyEnvMap = new Map(dailyEnvs.map((e: { id: string; name: string }) => [e.id, e.name]));

        // Assemble results
        const topFinalAction: { id: string; name: string; count: number } | null =
          topFaEntry && topFinalActionEntity
            ? { id: topFinalActionEntity.id, name: topFinalActionEntity.name, count: topFaEntry._count.finalActionId }
            : null;

        const byProductEnvironment = byProdEnvRaw.map((r: { productId: string; environmentId: string; _count: { id: number } }) => ({
          productId: r.productId,
          productName: productMap.get(r.productId) || "Unknown",
          environmentId: r.environmentId,
          environmentName: envMap.get(r.environmentId) || "Unknown",
          count: r._count.id,
        }));

        const byOperator = byOpRaw
          .map((r: { operatorId: string; _count: { id: number } }) => ({
            operatorId: r.operatorId,
            operatorName: opMap.get(r.operatorId) || "Unknown",
            count: r._count.id,
          }))
          .sort((a: { count: number }, b: { count: number }) => b.count - a.count);

        const dailyByEnvironment = dailyRaw.map((r: { date: string; environment_id: string; count: bigint; total_occurrences: bigint }) => ({
          date: typeof r.date === "string" ? r.date.split("T")[0] : new Date(r.date).toISOString().split("T")[0],
          environmentId: r.environment_id,
          environmentName: dailyEnvMap.get(r.environment_id) || envMap.get(r.environment_id) || "Unknown",
          count: Number(r.count),
          totalOccurrences: Number(r.total_occurrences),
        }));

        const byAnalysisType = byTypeRaw.map((r: { analysisType: string; _count: { id: number } }) => ({
          analysisType: r.analysisType,
          count: r._count.id,
        }));

        const topAlarms = topAlarmsRaw.map((r: { alarmId: string; _count: { id: number } }) => ({
          alarmId: r.alarmId,
          alarmName: alarmMap.get(r.alarmId) || "Unknown",
          count: r._count.id,
        }));

        // Pivot on-call data
        const onCallTrendMap = new Map<string, { onCall: number; normal: number }>();
        for (const r of onCallRaw) {
          const entry = onCallTrendMap.get(r.month) || { onCall: 0, normal: 0 };
          if (r.is_on_call) {
            entry.onCall = Number(r.count);
          } else {
            entry.normal = Number(r.count);
          }
          onCallTrendMap.set(r.month, entry);
        }

        const onCallTrend = Array.from(onCallTrendMap.entries())
          .map(([month, data]) => ({
            month,
            onCall: data.onCall,
            normal: data.normal,
          }))
          .sort((a, b) => a.month.localeCompare(b.month));

        // KPI: top operator (reuse byOperator which is already sorted desc)
        const topOpEntry = byOperator[0];
        const topOperator = topOpEntry
          ? { id: topOpEntry.operatorId, name: topOpEntry.operatorName, count: topOpEntry.count }
          : null;

        reply.send({
          kpi: {
            totalAnalyses,
            totalAnalysesPrevious,
            totalOccurrences,
            totalOccurrencesPrevious,
            topFinalAction,
            topOperator,
          },
          byProductEnvironment,
          byOperator,
          dailyByEnvironment,
          byAnalysisType,
          topAlarms,
          onCallTrend,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch analysis stats";
        reply.status(500).send({ error: message });
      }
    }
  );

  // ============================================================================
  // DELETE ANALYSIS
  // ============================================================================

  app.delete<{ Params: AlarmAnalysisParams }>(
    "/products/:productId/analyses/:id",
    {
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
        // Verify analysis exists and belongs to product
        const existing = await prisma.alarmAnalysis.findFirst({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        if (!existing) {
          return reply.status(404).send({ error: "Analysis not found" });
        }

        // Scope-aware ownership check for delete.
        const deleteScope = await getPermissionScope(
          request.user.userId,
          Resource.ALARM_ANALYSIS,
          "delete"
        );
        const canDeleteThis =
          deleteScope === PermissionScope.ALL ||
          (deleteScope === PermissionScope.OWN && existing.createdById === request.user.userId);
        if (!canDeleteThis) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        // Lock check: users with OWN delete scope cannot delete analyses older than the configured threshold.
        if (deleteScope === PermissionScope.OWN) {
          const lockSetting = await prisma.systemSetting.findUnique({ where: { key: "analysis_edit_lock_days" } });
          const lockDays = typeof lockSetting?.value === "number" ? lockSetting.value : 7;
          const daysSince = Math.floor((Date.now() - existing.createdAt.getTime()) / 86_400_000);
          if (daysSince >= lockDays) {
            return reply.status(403).send({
              error: `L'analisi non può più essere eliminata (blocco dopo ${lockDays} giorni dalla creazione)`,
            });
          }
        }

        await prisma.alarmAnalysis.delete({
          where: { id: request.params.id },
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
          return reply.status(404).send({ error: "Analysis not found" });
        }
        reply.status(500).send({ error: message });
      }
    }
  );
}

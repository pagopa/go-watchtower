import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  AlarmAnalysisParamsSchema,
  AlarmAnalysisQuerySchema,
  AlarmAnalysisResponseSchema,
  AllAnalysesQuerySchema,
  ErrorResponseSchema,
  PaginatedAlarmAnalysisResponseSchema,
  ProductIdParamsSchema,
  type AlarmAnalysisParams,
  type AlarmAnalysisQuery,
  type AllAnalysesQuery,
  type ProductIdParams,
} from "./schemas.js";
import {
  analysisInclude,
  analysisListSelect,
  buildAnalysisWhereClause,
  formatAnalysisListResponse,
  formatAnalysisResponse,
} from "./shared.js";

export async function registerAnalysisListingRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Params: ProductIdParams; Querystring: AlarmAnalysisQuery }>(
    "/products/:productId/analyses",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
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
        const product = await prisma.product.findUnique({
          where: { id: request.params.productId },
          select: { id: true },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const {
          page = 1,
          pageSize = 20,
          sortBy = "analysisDate",
          sortOrder = "desc",
        } = request.query;
        const where = buildAnalysisWhereClause(
          request.query,
          request.params.productId,
        );
        const skip = (page - 1) * pageSize;

        const [analyses, totalItems] = await Promise.all([
          prisma.alarmAnalysis.findMany({
            where,
            select: analysisListSelect,
            orderBy: { [sortBy]: sortOrder },
            skip,
            take: pageSize,
          }),
          prisma.alarmAnalysis.count({ where }),
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);
        reply.send({
          data: analyses.map(formatAnalysisListResponse),
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
        HttpError.internal(reply, message);
      }
    },
  );

  app.get<{ Querystring: AllAnalysesQuery }>(
    "/analyses",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
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
            select: analysisListSelect,
            orderBy: { [sortBy]: sortOrder },
            skip,
            take: pageSize,
          }),
          prisma.alarmAnalysis.count({ where }),
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);
        reply.send({
          data: analyses.map(formatAnalysisListResponse),
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
        HttpError.internal(reply, message);
      }
    },
  );

  app.get<{ Params: AlarmAnalysisParams }>(
    "/products/:productId/analyses/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
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
        const [analysis, mttaRow] = await Promise.all([
          prisma.alarmAnalysis.findFirst({
            where: {
              id: request.params.id,
              productId: request.params.productId,
            },
            include: analysisInclude,
          }),
          prisma.$queryRawUnsafe<
            Array<{
              avg_mtta_ms: number | null;
              avg_mttr_ms: number | null;
              avg_mttf_ms: number | null;
            }>
          >(
            `SELECT
               AVG(EXTRACT(EPOCH FROM (linked_at - fired_at)) * 1000) AS avg_mtta_ms,
               AVG(EXTRACT(EPOCH FROM (resolved_at - fired_at)) * 1000)
                 FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttr_ms,
               AVG(EXTRACT(EPOCH FROM (resolved_at - linked_at)) * 1000)
                 FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttf_ms
             FROM alarm_events
             WHERE analysis_id = $1
               AND linked_at IS NOT NULL`,
            request.params.id,
          ),
        ]);

        if (!analysis) {
          return HttpError.notFound(reply, "Analysis");
        }

        const response = formatAnalysisResponse(analysis);
        const row = mttaRow[0];
        if (row) {
          response.avgMttaMs =
            row.avg_mtta_ms != null ? Number(row.avg_mtta_ms) : null;
          response.avgMttrMs =
            row.avg_mttr_ms != null ? Number(row.avg_mttr_ms) : null;
          response.avgMttfMs =
            row.avg_mttf_ms != null ? Number(row.avg_mttf_ms) : null;
        }

        reply.send(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch analysis";
        HttpError.internal(reply, message);
      }
    },
  );
}

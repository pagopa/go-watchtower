import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Prisma, prisma, SystemComponent } from "@go-watchtower/database";
import type { IgnoreReasonDetailsSchema } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import { fromJson } from "../../utils/json-cast.js";
import {
  AnalysisPolicyResponseSchema,
  IgnoreReasonsResponseSchema,
  LinkTypesQuerySchema,
  LinkTypesResponseSchema,
  ErrorResponseSchema,
  type LinkTypesQuery,
} from "./schemas.js";

export async function registerAnalysisMetadataRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/analyses/ignore-reasons",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get all ignore reasons ordered by sort_order",
        security: [{ bearerAuth: [] }],
        response: { 200: IgnoreReasonsResponseSchema },
      },
    },
    async (_request, reply) => {
      const ignoreReasons = await prisma.ignoreReason.findMany({
        orderBy: { sortOrder: "asc" },
      });

      reply.send(
        ignoreReasons.map((row) => ({
          ...row,
          detailsSchema: fromJson<IgnoreReasonDetailsSchema>(row.detailsSchema),
        })),
      );
    },
  );

  app.get<{ Querystring: LinkTypesQuery }>(
    "/analyses/link-types",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["analyses"],
        summary: "Get distinct link types used by analyses",
        security: [{ bearerAuth: [] }],
        querystring: LinkTypesQuerySchema,
        response: {
          200: LinkTypesResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId } = request.query;
        const rows = await prisma.$queryRaw<Array<{ type: string }>>(
          Prisma.sql`
            SELECT DISTINCT BTRIM(link_item.link->>'type') AS type
            FROM alarm_analyses AS aa
            CROSS JOIN LATERAL jsonb_array_elements(aa.links) AS link_item(link)
            WHERE NULLIF(BTRIM(link_item.link->>'type'), '') IS NOT NULL
            ${productId ? Prisma.sql`AND aa.product_id = CAST(${productId} AS uuid)` : Prisma.empty}
            ORDER BY type ASC
          `,
        );

        reply.send(rows.map((row) => row.type));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch link types";
        HttpError.internal(reply, message);
      }
    },
  );

  app.get(
    "/analyses/policy",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["analyses"],
        summary: "Get analysis policy settings (e.g. edit lock days)",
        security: [{ bearerAuth: [] }],
        response: { 200: AnalysisPolicyResponseSchema },
      },
    },
    async (_request, reply) => {
      const [lockSetting, offsetSetting] = await Promise.all([
        prisma.systemSetting.findUnique({
          where: { key: "analysis_edit_lock_days" },
        }),
        prisma.systemSetting.findUnique({
          where: { key: "analysis_date_future_offset_minutes" },
        }),
      ]);

      return reply.send({
        editLockDays:
          typeof lockSetting?.value === "number" ? lockSetting.value : 7,
        analysisFutureOffsetMinutes:
          typeof offsetSetting?.value === "number" ? offsetSetting.value : 15,
      });
    },
  );
}

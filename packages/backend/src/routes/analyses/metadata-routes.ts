import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma } from "@go-watchtower/database";
import type { IgnoreReasonDetailsSchema } from "@go-watchtower/shared";
import { fromJson } from "../../utils/json-cast.js";
import {
  AnalysisPolicyResponseSchema,
  IgnoreReasonsResponseSchema,
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

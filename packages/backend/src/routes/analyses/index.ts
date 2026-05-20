import type { FastifyInstance } from "fastify";
import { registerAnalysisExportRoutes } from "./export-routes.js";
import { registerAnalysisListingRoutes } from "./listing-routes.js";
import { registerAnalysisMetadataRoutes } from "./metadata-routes.js";
import { registerAnalysisMutationRoutes } from "./mutation-routes.js";
import { registerAnalysisStatsRoutes } from "./stats-routes.js";

export async function analysisRoutes(fastify: FastifyInstance): Promise<void> {
  await registerAnalysisMetadataRoutes(fastify);
  await registerAnalysisListingRoutes(fastify);
  await registerAnalysisMutationRoutes(fastify);
  await registerAnalysisStatsRoutes(fastify);
  await registerAnalysisExportRoutes(fastify);
}

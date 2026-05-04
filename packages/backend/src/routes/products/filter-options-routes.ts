import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  SystemComponent,
  type Alarm,
  type Downstream,
  type Environment,
  type FinalAction,
  type Runbook,
} from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ErrorResponseSchema,
  FilterOptionsResponseSchema,
  ProductIdParamsSchema,
  type ProductIdParams,
} from "./schemas.js";

export async function registerFilterOptionsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/filter-options",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.ALARM_ANALYSIS, "read"),
      ],
      schema: {
        tags: ["analyses"],
        summary: "Get all filter options for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: FilterOptionsResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { productId } = request.params;
        const product = await prisma.product.findUnique({
          where: { id: productId },
        });

        if (!product) {
          return HttpError.notFound(reply, "Product");
        }

        const [environments, alarms, finalActions, resources, downstreams, runbooks] =
          await Promise.all([
            prisma.environment.findMany({
              where: { productId },
              orderBy: [{ order: "asc" }, { name: "asc" }],
            }),
            prisma.alarm.findMany({
              where: { productId },
              include: { runbook: { select: { id: true, name: true } } },
              orderBy: { name: "asc" },
            }),
            prisma.finalAction.findMany({
              where: { productId },
              orderBy: [{ order: "asc" }, { name: "asc" }],
            }),
            prisma.resource.findMany({
              where: { productId },
              include: { type: { select: { id: true, name: true } } },
              orderBy: { name: "asc" },
            }),
            prisma.downstream.findMany({
              where: { productId },
              orderBy: { name: "asc" },
            }),
            prisma.runbook.findMany({
              where: { productId },
              orderBy: { name: "asc" },
            }),
          ]);

        reply.send({
          environments: environments.map((environment: Environment) => ({
            id: environment.id,
            name: environment.name,
            description: environment.description,
            order: environment.order,
            productId: environment.productId,
            slackChannelId: environment.slackChannelId ?? null,
            defaultAwsAccountId: environment.defaultAwsAccountId ?? null,
            defaultAwsRegion: environment.defaultAwsRegion ?? null,
            onCallAlarmPattern: environment.onCallAlarmPattern ?? null,
            createdAt: environment.createdAt.toISOString(),
            updatedAt: environment.updatedAt.toISOString(),
          })),
          alarms: alarms.map(
            (alarm: Alarm & { runbook: { id: string; name: string } | null }) => ({
              id: alarm.id,
              name: alarm.name,
              description: alarm.description,
              runbookId: alarm.runbookId,
              runbook: alarm.runbook,
              productId: alarm.productId,
              createdAt: alarm.createdAt.toISOString(),
              updatedAt: alarm.updatedAt.toISOString(),
            }),
          ),
          finalActions: finalActions.map((finalAction: FinalAction) => ({
            id: finalAction.id,
            name: finalAction.name,
            description: finalAction.description,
            order: finalAction.order,
            isOther: finalAction.isOther,
            productId: finalAction.productId,
            createdAt: finalAction.createdAt.toISOString(),
            updatedAt: finalAction.updatedAt.toISOString(),
          })),
          resources: resources.map((resource) => ({
            id: resource.id,
            name: resource.name,
            description: resource.description,
            typeId: resource.typeId,
            type: resource.type,
            productId: resource.productId,
            createdAt: resource.createdAt.toISOString(),
            updatedAt: resource.updatedAt.toISOString(),
          })),
          downstreams: downstreams.map((downstream: Downstream) => ({
            id: downstream.id,
            name: downstream.name,
            description: downstream.description,
            productId: downstream.productId,
            createdAt: downstream.createdAt.toISOString(),
            updatedAt: downstream.updatedAt.toISOString(),
          })),
          runbooks: runbooks.map((runbook: Runbook) => ({
            id: runbook.id,
            name: runbook.name,
            description: runbook.description,
            link: runbook.link,
            status: runbook.status,
            productId: runbook.productId,
            createdAt: runbook.createdAt.toISOString(),
            updatedAt: runbook.updatedAt.toISOString(),
          })),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch filter options";
        HttpError.internal(reply, message);
      }
    },
  );
}

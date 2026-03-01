import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Resource } from "@go-watchtower/database";
import { hasPermission } from "../../services/permission.service.js";
import {
  SystemEventsQuerySchema,
  SystemEventsResponseSchema,
  ErrorResponseSchema,
  type SystemEventsQuery,
} from "./schemas.js";

export async function systemEventRoutes(fastify: FastifyInstance): Promise<void> {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.get<{ Querystring: SystemEventsQuery }>(
    "/system-events",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["system-events"],
        summary: "List system events (audit log)",
        security: [{ bearerAuth: [] }],
        querystring: SystemEventsQuerySchema,
        response: {
          200: SystemEventsResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const canRead = await hasPermission(
          request.user.userId,
          Resource.SYSTEM_SETTING,
          "read"
        );
        if (!canRead) {
          return reply.status(403).send({ error: "Permission denied" });
        }

        const {
          action,
          resource,
          userId,
          dateFrom,
          dateTo,
          page = 1,
          limit = 50,
        } = request.query;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: Record<string, any> = {};

        if (action && action.length > 0) {
          where.action = { in: action };
        }

        if (resource) {
          where.resource = resource;
        }

        if (userId) {
          where.userId = userId;
        }

        if (dateFrom || dateTo) {
          where.createdAt = {};
          if (dateFrom) {
            where.createdAt.gte = new Date(dateFrom);
          }
          if (dateTo) {
            where.createdAt.lte = new Date(dateTo);
          }
        }

        const skip = (page - 1) * limit;

        const [events, total] = await Promise.all([
          prisma.systemEvent.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
          }),
          prisma.systemEvent.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit);

        reply.send({
          data: events.map((e) => ({
            id: e.id,
            action: e.action,
            resource: e.resource,
            resourceId: e.resourceId,
            resourceLabel: e.resourceLabel,
            userId: e.userId,
            userLabel: e.userLabel,
            metadata: e.metadata,
            ipAddress: e.ipAddress,
            userAgent: e.userAgent,
            createdAt: e.createdAt.toISOString(),
          })),
          total,
          page,
          totalPages,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch system events";
        reply.status(500).send({ error: message });
      }
    }
  );
}

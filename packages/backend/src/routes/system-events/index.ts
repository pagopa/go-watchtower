import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
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
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "read")],
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
        const {
          action,
          resource,
          userId,
          dateFrom,
          dateTo,
          page = 1,
          limit = 50,
          sortBy = "createdAt",
          sortOrder = "desc",
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
          const createdAt: { gte?: Date; lte?: Date } = {};
          if (dateFrom) createdAt.gte = new Date(dateFrom);
          if (dateTo) createdAt.lte = new Date(dateTo);
          where.createdAt = createdAt;
        }

        const skip = (page - 1) * limit;

        const allowedSortKeys = ["createdAt", "action", "resource", "userLabel"] as const;
        const safeSortBy = (allowedSortKeys as readonly string[]).includes(sortBy) ? sortBy : "createdAt";
        const safeSortOrder = sortOrder === "asc" ? "asc" : "desc";

        const [events, total] = await Promise.all([
          prisma.systemEvent.findMany({
            where,
            orderBy: { [safeSortBy]: safeSortOrder },
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
        HttpError.internal(reply, message);
      }
    }
  );
}

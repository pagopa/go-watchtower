import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { buildDiff } from "../../services/system-event.service.js";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  formatPriorityLevel,
  getProductsImpactedByPriorityLevelChange,
  reclassifyAlarmEventsForProducts,
} from "../../services/alarm-priority.service.js";
import {
  PriorityLevelsResponseSchema,
  PriorityLevelResponseSchema,
  PriorityLevelParamsSchema,
  CreatePriorityLevelBodySchema,
  UpdatePriorityLevelBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type PriorityLevelParams,
  type CreatePriorityLevelBody,
  type UpdatePriorityLevelBody,
} from "./schemas.js";

function asAuditRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function doesPriorityLevelResolutionChange(
  previous: { rank: number; isActive: boolean; isDefault: boolean },
  next: { rank: number; isActive: boolean; isDefault: boolean },
): boolean {
  return previous.rank !== next.rank
    || previous.isActive !== next.isActive
    || previous.isDefault !== next.isDefault;
}

function affectsDefaultPriorityResolution(
  previous: { isActive: boolean; isDefault: boolean },
  next: { isActive: boolean; isDefault: boolean },
): boolean {
  return previous.isDefault !== next.isDefault
    || (previous.isDefault && previous.isActive !== next.isActive)
    || (next.isDefault && previous.isActive !== next.isActive);
}

export async function priorityLevelRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/priority-levels",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRIORITY_LEVEL, "read")],
      schema: {
        tags: ["priority-levels"],
        summary: "Get all priority levels",
        security: [{ bearerAuth: [] }],
        response: {
          200: PriorityLevelsResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const levels = await prisma.priorityLevel.findMany({
        orderBy: [{ rank: "desc" }, { code: "asc" }],
      });
      reply.send(levels.map(formatPriorityLevel));
    },
  );

  app.get<{ Params: PriorityLevelParams }>(
    "/priority-levels/:code",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRIORITY_LEVEL, "read")],
      schema: {
        tags: ["priority-levels"],
        summary: "Get a priority level by code",
        security: [{ bearerAuth: [] }],
        params: PriorityLevelParamsSchema,
        response: {
          200: PriorityLevelResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const level = await prisma.priorityLevel.findUnique({
        where: { code: request.params.code },
      });

      if (!level) {
        return HttpError.notFound(reply, "Priority level");
      }

      reply.send(formatPriorityLevel(level));
    },
  );

  app.post<{ Body: CreatePriorityLevelBody }>(
    "/priority-levels",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRIORITY_LEVEL, "write")],
      schema: {
        tags: ["priority-levels"],
        summary: "Create a priority level",
        security: [{ bearerAuth: [] }],
        body: CreatePriorityLevelBodySchema,
        response: {
          201: PriorityLevelResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const level = await prisma.$transaction(async (tx) => {
          if (request.body.isDefault) {
            await tx.priorityLevel.updateMany({
              where: { isDefault: true },
              data: { isDefault: false },
            });
          }

          return tx.priorityLevel.create({
            data: {
              code:           request.body.code,
              label:          request.body.label,
              description:    request.body.description ?? null,
              rank:           request.body.rank,
              color:          request.body.color ?? null,
              icon:           request.body.icon ?? null,
              isActive:       request.body.isActive ?? true,
              isDefault:      request.body.isDefault ?? false,
              countsAsOnCall: request.body.countsAsOnCall ?? false,
              defaultNotify:  request.body.defaultNotify ?? false,
              isSystem:       false,
            },
          });
        });
        const reclassification = level.isDefault
          ? await reclassifyAlarmEventsForProducts(
              await getProductsImpactedByPriorityLevelChange({
                priorityCode: level.code,
                affectsDefaultResolution: true,
              }),
            )
          : null;

        request.auditEvents.push({
          action:        SystemEventActions.PRIORITY_LEVEL_CREATED,
          resource:      SystemEventResources.PRIORITY_LEVELS,
          resourceId:    level.code,
          resourceLabel: level.label,
          metadata:      {
            created: asAuditRecord(formatPriorityLevel(level)),
            ...(reclassification ? { reclassification } : {}),
          },
        });

        reply.status(201).send(formatPriorityLevel(level));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create priority level";
        if (message.includes("Unique constraint")) {
          return HttpError.badRequest(reply, "Priority level code already exists");
        }
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.patch<{ Params: PriorityLevelParams; Body: UpdatePriorityLevelBody }>(
    "/priority-levels/:code",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRIORITY_LEVEL, "write")],
      schema: {
        tags: ["priority-levels"],
        summary: "Update a priority level",
        security: [{ bearerAuth: [] }],
        params: PriorityLevelParamsSchema,
        body: UpdatePriorityLevelBodySchema,
        response: {
          200: PriorityLevelResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.priorityLevel.findUnique({
        where: { code: request.params.code },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Priority level");
      }

      if (
        existing.isDefault &&
        request.body.isActive === false &&
        request.body.isDefault !== false
      ) {
        return HttpError.badRequest(reply, "Cannot deactivate the default priority level");
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          if (request.body.isDefault === true) {
            await tx.priorityLevel.updateMany({
              where: { isDefault: true, code: { not: request.params.code } },
              data: { isDefault: false },
            });
          }

          return tx.priorityLevel.update({
            where: { code: request.params.code },
            data: {
              ...(request.body.label !== undefined && { label: request.body.label }),
              ...(request.body.description !== undefined && { description: request.body.description }),
              ...(request.body.rank !== undefined && { rank: request.body.rank }),
              ...(request.body.color !== undefined && { color: request.body.color }),
              ...(request.body.icon !== undefined && { icon: request.body.icon }),
              ...(request.body.isActive !== undefined && { isActive: request.body.isActive }),
              ...(request.body.isDefault !== undefined && { isDefault: request.body.isDefault }),
              ...(request.body.countsAsOnCall !== undefined && { countsAsOnCall: request.body.countsAsOnCall }),
              ...(request.body.defaultNotify !== undefined && { defaultNotify: request.body.defaultNotify }),
            },
          });
        });
        const reclassification = doesPriorityLevelResolutionChange(existing, updated)
          ? await reclassifyAlarmEventsForProducts(
              await getProductsImpactedByPriorityLevelChange({
                priorityCode: updated.code,
                affectsDefaultResolution: affectsDefaultPriorityResolution(existing, updated),
              }),
            )
          : null;

        request.auditEvents.push({
          action:        SystemEventActions.PRIORITY_LEVEL_UPDATED,
          resource:      SystemEventResources.PRIORITY_LEVELS,
          resourceId:    updated.code,
          resourceLabel: updated.label,
          metadata: {
            changes: buildDiff(
              asAuditRecord(formatPriorityLevel(existing)),
              asAuditRecord(formatPriorityLevel(updated)),
            ),
            ...(reclassification ? { reclassification } : {}),
          },
        });

        reply.send(formatPriorityLevel(updated));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update priority level";
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.delete<{ Params: PriorityLevelParams }>(
    "/priority-levels/:code",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.PRIORITY_LEVEL, "delete")],
      schema: {
        tags: ["priority-levels"],
        summary: "Delete a priority level",
        security: [{ bearerAuth: [] }],
        params: PriorityLevelParamsSchema,
        response: {
          200: MessageResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.priorityLevel.findUnique({
        where: { code: request.params.code },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Priority level");
      }

      if (existing.isSystem) {
        return HttpError.badRequest(reply, "System priority levels cannot be deleted");
      }

      const [rulesCount, eventsCount] = await Promise.all([
        prisma.alarmPriorityRule.count({ where: { priorityCode: request.params.code } }),
        prisma.alarmEvent.count({ where: { priorityCode: request.params.code } }),
      ]);

      if (rulesCount > 0 || eventsCount > 0) {
        return HttpError.badRequest(reply, "Priority level is still referenced. Deactivate it instead.");
      }

      await prisma.priorityLevel.delete({
        where: { code: request.params.code },
      });

      request.auditEvents.push({
        action:        SystemEventActions.PRIORITY_LEVEL_DELETED,
        resource:      SystemEventResources.PRIORITY_LEVELS,
        resourceId:    existing.code,
        resourceLabel: existing.label,
        metadata:      { deleted: asAuditRecord(formatPriorityLevel(existing)) },
      });

      reply.send({ message: "Priority level deleted successfully" });
    },
  );
}

import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { prisma, SystemComponent, PermissionScope } from "@go-watchtower/database";
import { buildDiff } from "../../services/system-event.service.js";
import { getPermissionScope } from "../../services/permission.service.js";
import { SystemEventActions, SystemEventResources, AnalysisStatuses } from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import { requirePermission } from "../../lib/require-permission.js";
import {
  AlarmEventResponseSchema,
  PaginatedAlarmEventsResponseSchema,
  AlarmEventParamsSchema,
  AlarmEventsQuerySchema,
  CreateAlarmEventBodySchema,
  UpdateAlarmEventBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type AlarmEventParams,
  type AlarmEventsQuery,
  type CreateAlarmEventBody,
  type UpdateAlarmEventBody,
} from "./schemas.js";

const include = {
  product:     { select: { id: true, name: true } },
  environment: { select: { id: true, name: true } },
  alarm: {
    select: {
      id:          true,
      name:        true,
      description: true,
      runbook:     { select: { id: true, name: true, link: true } },
    },
  },
} as const;

type EmbeddedAlarm = {
  id: string;
  name: string;
  description: string | null;
  runbook: { id: string; name: string; link: string } | null;
} | null;

function formatResponse(event: {
  id: string;
  name: string;
  firedAt: Date;
  description: string | null;
  reason: string | null;
  awsRegion: string;
  awsAccountId: string;
  alarmId: string | null;
  analysisId: string | null;
  createdAt: Date;
  product: { id: string; name: string };
  environment: { id: string; name: string };
  alarm: EmbeddedAlarm;
}) {
  return {
    ...event,
    firedAt:   event.firedAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

export async function alarmEventRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  // ─── GET /alarm-events ───────────────────────────────────────────────────

  server.get<{ Querystring: AlarmEventsQuery }>(
    "/alarm-events",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Alarm Events"],
        summary: "List alarm events",
        security: [{ bearerAuth: [] }],
        querystring: AlarmEventsQuerySchema,
        response: { 200: PaginatedAlarmEventsResponseSchema },
      },
    },
    async (request, reply) => {
      const { productId, environmentId, alarmId, analysisId, awsAccountId, awsRegion, dateFrom, dateTo, page = 1, pageSize = 20 } = request.query;

      const where = {
        ...(productId     && { productId }),
        ...(environmentId && { environmentId: { in: Array.isArray(environmentId) ? environmentId : [environmentId] } }),
        ...(alarmId       && { alarmId }),
        ...(analysisId    && { analysisId }),
        ...(awsAccountId  && { awsAccountId }),
        ...(awsRegion     && { awsRegion }),
        ...((dateFrom || dateTo) && {
          firedAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo   && { lte: new Date(dateTo) }),
          },
        }),
      };

      const [totalItems, data] = await Promise.all([
        prisma.alarmEvent.count({ where }),
        prisma.alarmEvent.findMany({
          where,
          include,
          orderBy: { firedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      return reply.send({
        data: data.map(formatResponse),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    }
  );

  // ─── GET /alarm-events/:id ───────────────────────────────────────────────

  server.get<{ Params: AlarmEventParams }>(
    "/alarm-events/:id",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Alarm Events"],
        summary: "Get a single alarm event",
        security: [{ bearerAuth: [] }],
        params: AlarmEventParamsSchema,
        response: {
          200: AlarmEventResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const event = await prisma.alarmEvent.findUnique({
        where: { id: request.params.id },
        include,
      });

      if (!event) {
        return HttpError.notFound(reply, "Alarm event");
      }

      return reply.send(formatResponse(event));
    }
  );

  // ─── POST /alarm-events ──────────────────────────────────────────────────

  server.post<{ Body: CreateAlarmEventBody }>(
    "/alarm-events",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.ALARM_EVENT, "write")],
      schema: {
        tags: ["Alarm Events"],
        summary: "Create an alarm event",
        security: [{ bearerAuth: [] }],
        body: CreateAlarmEventBodySchema,
        response: {
          201: AlarmEventResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { productId, environmentId, name, firedAt, awsRegion, awsAccountId, description, reason } = request.body;

      const [product, environment] = await Promise.all([
        prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
        prisma.environment.findUnique({ where: { id: environmentId }, select: { id: true } }),
      ]);

      if (!product) {
        return HttpError.notFound(reply, "Product");
      }
      if (!environment) {
        return HttpError.notFound(reply, "Environment");
      }

      const event = await prisma.alarmEvent.create({
        data: {
          name,
          firedAt:      new Date(firedAt),
          awsRegion,
          awsAccountId,
          description:  description ?? null,
          reason:       reason ?? null,
          productId,
          environmentId,
        },
        include,
      });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_EVENT_CREATED,
        resource:      SystemEventResources.ALARM_EVENTS,
        resourceId:    event.id,
        resourceLabel: event.name,
        metadata:      { created: { name, firedAt, awsRegion, awsAccountId, productId, environmentId } },
      });

      return reply.status(201).send(formatResponse(event));
    }
  );

  // ─── PATCH /alarm-events/:id ─────────────────────────────────────────────

  server.patch<{ Params: AlarmEventParams; Body: UpdateAlarmEventBody }>(
    "/alarm-events/:id",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.ALARM_EVENT, "write")],
      schema: {
        tags: ["Alarm Events"],
        summary: "Update an alarm event",
        security: [{ bearerAuth: [] }],
        params: AlarmEventParamsSchema,
        body: UpdateAlarmEventBodySchema,
        response: {
          200: AlarmEventResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.alarmEvent.findUnique({
        where: { id: request.params.id },
        select: { id: true, name: true, description: true, reason: true, alarmId: true, analysisId: true },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Alarm event");
      }

      // Only include fields that were explicitly sent in the body.
      // Prisma ignores undefined but treats null as "set to null".
      const data: Record<string, unknown> = {};
      if (request.body.description !== undefined) data.description = request.body.description || null;
      if (request.body.reason !== undefined)      data.reason      = request.body.reason || null;
      if (request.body.alarmId !== undefined)     data.alarmId     = request.body.alarmId || null;
      if (request.body.analysisId !== undefined)  data.analysisId  = request.body.analysisId || null;

      const updated = await prisma.alarmEvent.update({
        where: { id: request.params.id },
        data,
        include,
      });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_EVENT_UPDATED,
        resource:      SystemEventResources.ALARM_EVENTS,
        resourceId:    updated.id,
        resourceLabel: updated.name,
        metadata:      { changes: buildDiff(existing, updated, ["description", "reason", "alarmId", "analysisId"]) },
      });

      return reply.send(formatResponse(updated));
    }
  );

  // ─── PATCH /alarm-events/:id/link-analysis ──────────────────────────────
  //
  // Dedicated endpoint for linking/unlinking an analysis to an alarm event.
  // Requires ALARM_ANALYSIS write (not ALARM_EVENT write) so that operators
  // who can create analyses can also associate them to events.

  server.patch<{
    Params: AlarmEventParams;
    Body: {
      analysisId: string | null;
      analysisUpdates?: {
        incrementOccurrences?: boolean;
        lastAlarmAt?: string;
        reopenAnalysis?: boolean;
      };
    };
  }>(
    "/alarm-events/:id/link-analysis",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.ALARM_ANALYSIS, "write")],
      schema: {
        tags: ["Alarm Events"],
        summary: "Link or unlink an analysis to/from an alarm event, with optional analysis updates",
        security: [{ bearerAuth: [] }],
        params: AlarmEventParamsSchema,
        body: Type.Object({
          analysisId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
          analysisUpdates: Type.Optional(Type.Object({
            incrementOccurrences: Type.Optional(Type.Boolean()),
            lastAlarmAt: Type.Optional(Type.String({ format: "date-time" })),
            reopenAnalysis: Type.Optional(Type.Boolean()),
          })),
        }),
        response: {
          200: AlarmEventResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.alarmEvent.findUnique({
        where: { id: request.params.id },
        select: { id: true, name: true, analysisId: true },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Alarm event");
      }

      const analysisId = request.body.analysisId || null;
      const updates = request.body.analysisUpdates;

      // Scope-aware ownership check for analysis updates
      let canUpdateAnalysis = false;
      if (analysisId && updates) {
        const writeScope = await getPermissionScope(
          request.user.userId,
          SystemComponent.ALARM_ANALYSIS,
          "write"
        );
        if (writeScope === PermissionScope.ALL) {
          canUpdateAnalysis = true;
        } else if (writeScope === PermissionScope.OWN) {
          const target = await prisma.alarmAnalysis.findUnique({
            where: { id: analysisId },
            select: { createdById: true },
          });
          canUpdateAnalysis = target?.createdById === request.user.userId;
        }
        if (!canUpdateAnalysis && Object.keys(updates).some((k) => updates[k as keyof typeof updates])) {
          return HttpError.forbidden(reply, "Non puoi modificare un'analisi creata da un altro utente");
        }
      }

      // Apply link + optional analysis updates in a single transaction
      const updated = await prisma.$transaction(async (tx) => {
        const event = await tx.alarmEvent.update({
          where: { id: request.params.id },
          data: { analysisId },
          include,
        });

        // Apply analysis updates if linking (not unlinking) and updates are requested
        if (analysisId && updates && canUpdateAnalysis) {
          const analysis = await tx.alarmAnalysis.findUnique({
            where: { id: analysisId },
            select: { id: true, occurrences: true, lastAlarmAt: true, status: true, alarm: { select: { name: true } } },
          });

          if (analysis) {
            const data: Record<string, unknown> = {};

            if (updates.incrementOccurrences) {
              data.occurrences = analysis.occurrences + 1;
            }
            if (updates.lastAlarmAt && new Date(updates.lastAlarmAt).getTime() > analysis.lastAlarmAt.getTime()) {
              data.lastAlarmAt = new Date(updates.lastAlarmAt);
            }
            if (updates.reopenAnalysis && analysis.status === AnalysisStatuses.COMPLETED) {
              data.status = AnalysisStatuses.IN_PROGRESS;
            }

            if (Object.keys(data).length > 0) {
              await tx.alarmAnalysis.update({ where: { id: analysisId }, data });

              request.auditEvents.push({
                action:        SystemEventActions.ANALYSIS_UPDATED,
                resource:      SystemEventResources.ALARM_ANALYSES,
                resourceId:    analysis.id,
                resourceLabel: analysis.alarm.name,
                metadata:      { changes: data, via: "link-analysis" },
              });
            }
          }
        }

        return event;
      });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_EVENT_UPDATED,
        resource:      SystemEventResources.ALARM_EVENTS,
        resourceId:    updated.id,
        resourceLabel: updated.name,
        metadata:      { changes: buildDiff(existing, updated, ["analysisId"]) },
      });

      return reply.send(formatResponse(updated));
    }
  );

  // ─── DELETE /alarm-events/:id ────────────────────────────────────────────

  server.delete<{ Params: AlarmEventParams }>(
    "/alarm-events/:id",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.ALARM_EVENT, "delete")],
      schema: {
        tags: ["Alarm Events"],
        summary: "Delete an alarm event",
        security: [{ bearerAuth: [] }],
        params: AlarmEventParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.alarmEvent.findUnique({
        where: { id: request.params.id },
        select: { id: true, name: true },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Alarm event");
      }

      await prisma.alarmEvent.delete({ where: { id: request.params.id } });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_EVENT_DELETED,
        resource:      SystemEventResources.ALARM_EVENTS,
        resourceId:    existing.id,
        resourceLabel: existing.name,
      });

      return reply.send({ message: "Alarm event deleted" });
    }
  );
}

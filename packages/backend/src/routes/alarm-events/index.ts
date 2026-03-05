import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Resource } from "@go-watchtower/database";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
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
      const { productId, environmentId, alarmId, awsAccountId, awsRegion, dateFrom, dateTo, page = 1, pageSize = 20 } = request.query;

      const where = {
        ...(productId     && { productId }),
        ...(environmentId && { environmentId }),
        ...(alarmId       && { alarmId }),
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
        return reply.status(404).send({ error: "Alarm event not found" });
      }

      return reply.send(formatResponse(event));
    }
  );

  // ─── POST /alarm-events ──────────────────────────────────────────────────

  server.post<{ Body: CreateAlarmEventBody }>(
    "/alarm-events",
    {
      onRequest: [server.authenticate, requirePermission(Resource.ALARM_EVENT, "write")],
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
        return reply.status(404).send({ error: "Product not found" });
      }
      if (!environment) {
        return reply.status(404).send({ error: "Environment not found" });
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
      onRequest: [server.authenticate, requirePermission(Resource.ALARM_EVENT, "write")],
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
        select: { id: true, name: true, description: true, reason: true, alarmId: true },
      });

      if (!existing) {
        return reply.status(404).send({ error: "Alarm event not found" });
      }

      const updated = await prisma.alarmEvent.update({
        where: { id: request.params.id },
        data: {
          description: request.body.description,
          reason:      request.body.reason,
          alarmId:     request.body.alarmId,
        },
        include,
      });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_EVENT_UPDATED,
        resource:      SystemEventResources.ALARM_EVENTS,
        resourceId:    updated.id,
        resourceLabel: updated.name,
        metadata:      { changes: buildDiff(existing, updated, ["description", "reason", "alarmId"]) },
      });

      return reply.send(formatResponse(updated));
    }
  );

  // ─── DELETE /alarm-events/:id ────────────────────────────────────────────

  server.delete<{ Params: AlarmEventParams }>(
    "/alarm-events/:id",
    {
      onRequest: [server.authenticate, requirePermission(Resource.ALARM_EVENT, "delete")],
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
        return reply.status(404).send({ error: "Alarm event not found" });
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

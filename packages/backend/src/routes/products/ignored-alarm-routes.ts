import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  SystemComponent,
  type IgnoredAlarm,
} from "@go-watchtower/database";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { buildDiff } from "../../services/system-event.service.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  CreateIgnoredAlarmBodySchema,
  ErrorResponseSchema,
  IgnoredAlarmParamsSchema,
  IgnoredAlarmResponseSchema,
  IgnoredAlarmsResponseSchema,
  MessageResponseSchema,
  ProductIdParamsSchema,
  UpdateIgnoredAlarmBodySchema,
  type CreateIgnoredAlarmBody,
  type IgnoredAlarmParams,
  type ProductIdParams,
  type UpdateIgnoredAlarmBody,
} from "./schemas.js";

function formatIgnoredAlarm(
  ignoredAlarm: IgnoredAlarm & {
    alarm: { id: string; name: string };
    environment: { id: string; name: string };
  },
) {
  return {
    id: ignoredAlarm.id,
    alarmId: ignoredAlarm.alarmId,
    environmentId: ignoredAlarm.environmentId,
    reason: ignoredAlarm.reason,
    isActive: ignoredAlarm.isActive,
    productId: ignoredAlarm.productId,
    validity: ignoredAlarm.validity as unknown[],
    exclusions: ignoredAlarm.exclusions as unknown[],
    alarm: ignoredAlarm.alarm,
    environment: ignoredAlarm.environment,
    createdAt: ignoredAlarm.createdAt.toISOString(),
    updatedAt: ignoredAlarm.updatedAt.toISOString(),
  };
}

export async function registerIgnoredAlarmRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Params: ProductIdParams }>(
    "/products/:productId/ignored-alarms",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.IGNORED_ALARM, "read"),
      ],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Get all ignored alarms for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: IgnoredAlarmsResponseSchema,
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

        const ignoredAlarms = await prisma.ignoredAlarm.findMany({
          where: { productId: request.params.productId },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        reply.send(ignoredAlarms.map(formatIgnoredAlarm));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch ignored alarms";
        HttpError.internal(reply, message);
      }
    },
  );

  app.get<{ Params: IgnoredAlarmParams }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.IGNORED_ALARM, "read"),
      ],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Get an ignored alarm by ID",
        security: [{ bearerAuth: [] }],
        params: IgnoredAlarmParamsSchema,
        response: {
          200: IgnoredAlarmResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const ignoredAlarm = await prisma.ignoredAlarm.findFirst({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
        });

        if (!ignoredAlarm) {
          return HttpError.notFound(reply, "Ignored alarm");
        }

        reply.send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to fetch ignored alarm";
        HttpError.internal(reply, message);
      }
    },
  );

  app.post<{ Params: ProductIdParams; Body: CreateIgnoredAlarmBody }>(
    "/products/:productId/ignored-alarms",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.IGNORED_ALARM, "write"),
      ],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Create a new ignored alarm",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        body: CreateIgnoredAlarmBodySchema,
        response: {
          201: IgnoredAlarmResponseSchema,
          400: ErrorResponseSchema,
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

        const ignoredAlarm = await prisma.ignoredAlarm.create({
          data: {
            alarmId: request.body.alarmId,
            environmentId: request.body.environmentId,
            reason: request.body.reason || null,
            isActive: request.body.isActive ?? true,
            productId: request.params.productId,
            validity: request.body.validity ?? [],
            exclusions: request.body.exclusions ?? [],
          },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.IGNORED_ALARM_CREATED,
          resource: SystemEventResources.IGNORED_ALARMS,
          resourceId: ignoredAlarm.id,
          resourceLabel: ignoredAlarm.alarm?.name ?? null,
          metadata: { created: ignoredAlarm },
        });

        reply.status(201).send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to create ignored alarm";
        if (message.includes("Unique constraint")) {
          return HttpError.badRequest(
            reply,
            "This alarm is already ignored for this environment",
          );
        }
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.put<{ Params: IgnoredAlarmParams; Body: UpdateIgnoredAlarmBody }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.IGNORED_ALARM, "write"),
      ],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Update an ignored alarm",
        security: [{ bearerAuth: [] }],
        params: IgnoredAlarmParamsSchema,
        body: UpdateIgnoredAlarmBodySchema,
        response: {
          200: IgnoredAlarmResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const existingIgnoredAlarm = await prisma.ignoredAlarm.findUnique({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          select: {
            alarmId: true,
            environmentId: true,
            reason: true,
            isActive: true,
            validity: true,
            exclusions: true,
          },
        });

        const ignoredAlarm = await prisma.ignoredAlarm.update({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          data: {
            ...(request.body.alarmId !== undefined && {
              alarmId: request.body.alarmId,
            }),
            ...(request.body.environmentId !== undefined && {
              environmentId: request.body.environmentId,
            }),
            ...(request.body.reason !== undefined && {
              reason: request.body.reason,
            }),
            ...(request.body.isActive !== undefined && {
              isActive: request.body.isActive,
            }),
            ...(request.body.validity !== undefined && {
              validity: request.body.validity,
            }),
            ...(request.body.exclusions !== undefined && {
              exclusions: request.body.exclusions,
            }),
          },
          include: {
            alarm: { select: { id: true, name: true } },
            environment: { select: { id: true, name: true } },
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.IGNORED_ALARM_UPDATED,
          resource: SystemEventResources.IGNORED_ALARMS,
          resourceId: ignoredAlarm.id,
          resourceLabel: ignoredAlarm.alarm?.name ?? null,
          metadata: {
            productId: request.params.productId,
            changes: buildDiff(
              {
                alarmId: existingIgnoredAlarm?.alarmId,
                environmentId: existingIgnoredAlarm?.environmentId,
                reason: existingIgnoredAlarm?.reason,
                isActive: existingIgnoredAlarm?.isActive,
                validity: existingIgnoredAlarm?.validity,
                exclusions: existingIgnoredAlarm?.exclusions,
              },
              {
                alarmId: ignoredAlarm.alarmId,
                environmentId: ignoredAlarm.environmentId,
                reason: ignoredAlarm.reason,
                isActive: ignoredAlarm.isActive,
                validity: ignoredAlarm.validity,
                exclusions: ignoredAlarm.exclusions,
              },
            ),
          },
        });

        reply.send(formatIgnoredAlarm(ignoredAlarm));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update ignored alarm";
        if (message.includes("Record to update not found")) {
          return HttpError.notFound(reply, "Ignored alarm");
        }
        if (message.includes("Unique constraint")) {
          return HttpError.badRequest(
            reply,
            "This alarm is already ignored for this environment",
          );
        }
        HttpError.badRequest(reply, message);
      }
    },
  );

  app.delete<{ Params: IgnoredAlarmParams }>(
    "/products/:productId/ignored-alarms/:id",
    {
      onRequest: [
        app.authenticate,
        requirePermission(SystemComponent.IGNORED_ALARM, "delete"),
      ],
      schema: {
        tags: ["ignored-alarms"],
        summary: "Delete an ignored alarm",
        security: [{ bearerAuth: [] }],
        params: IgnoredAlarmParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const ignoredAlarmToDelete = await prisma.ignoredAlarm.findFirst({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
          include: { alarm: { select: { name: true } } },
        });

        await prisma.ignoredAlarm.delete({
          where: {
            id: request.params.id,
            productId: request.params.productId,
          },
        });

        request.auditEvents.push({
          action: SystemEventActions.IGNORED_ALARM_DELETED,
          resource: SystemEventResources.IGNORED_ALARMS,
          resourceId: request.params.id,
          resourceLabel: ignoredAlarmToDelete?.alarm?.name ?? null,
          metadata: { productId: request.params.productId },
        });

        reply.send({ message: "Ignored alarm deleted successfully" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to delete ignored alarm";
        if (message.includes("Record to delete does not exist")) {
          return HttpError.notFound(reply, "Ignored alarm");
        }
        HttpError.internal(reply, message);
      }
    },
  );
}

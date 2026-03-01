import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma } from "@go-watchtower/database";
import { hasPermission } from "../../services/permission.service.js";
import { logEvent, buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import {
  IgnoreReasonResponseSchema,
  IgnoreReasonsResponseSchema,
  IgnoreReasonParamsSchema,
  CreateIgnoreReasonBodySchema,
  UpdateIgnoreReasonBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type IgnoreReasonParams,
  type CreateIgnoreReasonBody,
  type UpdateIgnoreReasonBody,
} from "./schemas.js";

export async function ignoreReasonRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  // ─── GET /ignore-reasons ─────────────────────────────────────────────────

  server.get(
    "/ignore-reasons",
    {
      schema: {
        tags: ["Ignore Reasons"],
        summary: "List all ignore reasons",
        response: { 200: IgnoreReasonsResponseSchema },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();

      const reasons = await prisma.ignoreReason.findMany({
        orderBy: { sortOrder: "asc" },
      });

      return reply.send(
        reasons.map((r) => ({
          ...r,
          detailsSchema: r.detailsSchema as Record<string, unknown> | null,
        }))
      );
    }
  );

  // ─── GET /ignore-reasons/:code ───────────────────────────────────────────

  server.get<{ Params: IgnoreReasonParams }>(
    "/ignore-reasons/:code",
    {
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Get a single ignore reason",
        params: IgnoreReasonParamsSchema,
        response: {
          200: IgnoreReasonResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();

      const reason = await prisma.ignoreReason.findUnique({
        where: { code: request.params.code },
      });

      if (!reason) {
        return reply.status(404).send({ error: "Ignore reason not found" });
      }

      return reply.send({
        ...reason,
        detailsSchema: reason.detailsSchema as Record<string, unknown> | null,
      });
    }
  );

  // ─── POST /ignore-reasons ────────────────────────────────────────────────

  server.post<{ Body: CreateIgnoreReasonBody }>(
    "/ignore-reasons",
    {
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Create an ignore reason",
        body: CreateIgnoreReasonBodySchema,
        response: {
          201: IgnoreReasonResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();

      const allowed = await hasPermission(request.user.userId, "SYSTEM_SETTING", "write");
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const existing = await prisma.ignoreReason.findUnique({
        where: { code: request.body.code },
      });
      if (existing) {
        return reply.status(409).send({ error: `Ignore reason '${request.body.code}' already exists` });
      }

      const reason = await prisma.ignoreReason.create({
        data: {
          code:          request.body.code,
          label:         request.body.label,
          description:   request.body.description ?? null,
          sortOrder:     request.body.sortOrder ?? 0,
          detailsSchema: request.body.detailsSchema != null
            ? request.body.detailsSchema as unknown as Prisma.InputJsonValue
            : Prisma.DbNull,
        },
      });

      logEvent({
        action: SystemEventActions.SETTING_UPDATED,
        resource: SystemEventResources.SYSTEM_SETTINGS,
        resourceId: reason.code,
        resourceLabel: reason.label,
        userId: request.user.userId,
        userLabel: request.user.email,
        metadata: { operation: "create", code: reason.code },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(201).send({
        ...reason,
        detailsSchema: reason.detailsSchema as Record<string, unknown> | null,
      });
    }
  );

  // ─── PATCH /ignore-reasons/:code ─────────────────────────────────────────

  server.patch<{ Params: IgnoreReasonParams; Body: UpdateIgnoreReasonBody }>(
    "/ignore-reasons/:code",
    {
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Update an ignore reason",
        params: IgnoreReasonParamsSchema,
        body: UpdateIgnoreReasonBodySchema,
        response: {
          200: IgnoreReasonResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();

      const allowed = await hasPermission(request.user.userId, "SYSTEM_SETTING", "write");
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const existing = await prisma.ignoreReason.findUnique({
        where: { code: request.params.code },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Ignore reason not found" });
      }

      const updated = await prisma.ignoreReason.update({
        where: { code: request.params.code },
        data:  {
          label:         request.body.label,
          description:   request.body.description,
          sortOrder:     request.body.sortOrder,
          detailsSchema: request.body.detailsSchema !== undefined
            ? (request.body.detailsSchema != null
                ? request.body.detailsSchema as unknown as Prisma.InputJsonValue
                : Prisma.DbNull)
            : undefined,
        },
      });

      logEvent({
        action: SystemEventActions.SETTING_UPDATED,
        resource: SystemEventResources.SYSTEM_SETTINGS,
        resourceId: updated.code,
        resourceLabel: updated.label,
        userId: request.user.userId,
        userLabel: request.user.email,
        metadata: {
          operation: "update",
          code: updated.code,
          changes: buildDiff(existing, updated, ["label", "description", "sortOrder"]),
        },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({
        ...updated,
        detailsSchema: updated.detailsSchema as Record<string, unknown> | null,
      });
    }
  );

  // ─── DELETE /ignore-reasons/:code ────────────────────────────────────────

  server.delete<{ Params: IgnoreReasonParams }>(
    "/ignore-reasons/:code",
    {
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Delete an ignore reason",
        params: IgnoreReasonParamsSchema,
        response: {
          200: MessageResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await request.jwtVerify();

      const allowed = await hasPermission(request.user.userId, "SYSTEM_SETTING", "write");
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const existing = await prisma.ignoreReason.findUnique({
        where: { code: request.params.code },
        include: { _count: { select: { analyses: true } } },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Ignore reason not found" });
      }

      if (existing._count.analyses > 0) {
        return reply.status(400).send({
          error: `Cannot delete: ${existing._count.analyses} analisi usano questo motivo`,
        });
      }

      await prisma.ignoreReason.delete({ where: { code: request.params.code } });

      logEvent({
        action: SystemEventActions.SETTING_UPDATED,
        resource: SystemEventResources.SYSTEM_SETTINGS,
        resourceId: existing.code,
        resourceLabel: existing.label,
        userId: request.user.userId,
        userLabel: request.user.email,
        metadata: { operation: "delete", code: existing.code },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send({ message: "Ignore reason deleted" });
    }
  );
}

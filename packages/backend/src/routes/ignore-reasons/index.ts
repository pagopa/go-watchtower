import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, SystemComponent } from "@go-watchtower/database";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import type { IgnoreReasonDetailsSchema } from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import { toJsonInput, fromJson } from "../../utils/json-cast.js";
import { requirePermission } from "../../lib/require-permission.js";
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
      onRequest: [server.authenticate],
      schema: {
        tags: ["Ignore Reasons"],
        summary: "List all ignore reasons",
        security: [{ bearerAuth: [] }],
        response: { 200: IgnoreReasonsResponseSchema },
      },
    },
    async (_request, reply) => {
      const reasons = await prisma.ignoreReason.findMany({
        orderBy: { sortOrder: "asc" },
      });

      return reply.send(
        reasons.map((r) => ({
          ...r,
          detailsSchema: fromJson<IgnoreReasonDetailsSchema>(r.detailsSchema),
        }))
      );
    }
  );

  // ─── GET /ignore-reasons/:code ───────────────────────────────────────────

  server.get<{ Params: IgnoreReasonParams }>(
    "/ignore-reasons/:code",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Get a single ignore reason",
        security: [{ bearerAuth: [] }],
        params: IgnoreReasonParamsSchema,
        response: {
          200: IgnoreReasonResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const reason = await prisma.ignoreReason.findUnique({
        where: { code: request.params.code },
      });

      if (!reason) {
        return HttpError.notFound(reply, "Ignore reason");
      }

      return reply.send({
        ...reason,
        detailsSchema: fromJson<IgnoreReasonDetailsSchema>(reason.detailsSchema),
      });
    }
  );

  // ─── POST /ignore-reasons ────────────────────────────────────────────────

  server.post<{ Body: CreateIgnoreReasonBody }>(
    "/ignore-reasons",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "write")],
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Create an ignore reason",
        security: [{ bearerAuth: [] }],
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
      const existing = await prisma.ignoreReason.findUnique({
        where: { code: request.body.code },
      });
      if (existing) {
        return HttpError.conflict(reply, `Ignore reason '${request.body.code}' already exists`);
      }

      const reason = await prisma.ignoreReason.create({
        data: {
          code:          request.body.code,
          label:         request.body.label,
          description:   request.body.description ?? null,
          sortOrder:     request.body.sortOrder ?? 0,
          detailsSchema: request.body.detailsSchema != null
            ? toJsonInput(request.body.detailsSchema)
            : Prisma.DbNull,
        },
      });

      request.auditEvents.push({
        action: SystemEventActions.IGNORE_REASON_CREATED,
        resource: SystemEventResources.IGNORE_REASONS,
        resourceId: reason.code,
        resourceLabel: reason.label,
        metadata: { created: reason },
      });

      return reply.status(201).send({
        ...reason,
        detailsSchema: fromJson<IgnoreReasonDetailsSchema>(reason.detailsSchema),
      });
    }
  );

  // ─── PATCH /ignore-reasons/:code ─────────────────────────────────────────

  server.patch<{ Params: IgnoreReasonParams; Body: UpdateIgnoreReasonBody }>(
    "/ignore-reasons/:code",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "write")],
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Update an ignore reason",
        security: [{ bearerAuth: [] }],
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
      const existing = await prisma.ignoreReason.findUnique({
        where: { code: request.params.code },
      });
      if (!existing) {
        return HttpError.notFound(reply, "Ignore reason");
      }

      const updated = await prisma.ignoreReason.update({
        where: { code: request.params.code },
        data:  {
          label:         request.body.label,
          description:   request.body.description,
          sortOrder:     request.body.sortOrder,
          detailsSchema: request.body.detailsSchema !== undefined
            ? (request.body.detailsSchema != null
                ? toJsonInput(request.body.detailsSchema)
                : Prisma.DbNull)
            : undefined,
        },
      });

      request.auditEvents.push({
        action: SystemEventActions.IGNORE_REASON_UPDATED,
        resource: SystemEventResources.IGNORE_REASONS,
        resourceId: updated.code,
        resourceLabel: updated.label,
        metadata: {
          changes: buildDiff(existing, updated, ["label", "description", "sortOrder", "detailsSchema"]),
        },
      });

      return reply.send({
        ...updated,
        detailsSchema: fromJson<IgnoreReasonDetailsSchema>(updated.detailsSchema),
      });
    }
  );

  // ─── DELETE /ignore-reasons/:code ────────────────────────────────────────

  server.delete<{ Params: IgnoreReasonParams }>(
    "/ignore-reasons/:code",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "write")],
      schema: {
        tags: ["Ignore Reasons"],
        summary: "Delete an ignore reason",
        security: [{ bearerAuth: [] }],
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
      const existing = await prisma.ignoreReason.findUnique({
        where: { code: request.params.code },
        include: { _count: { select: { analyses: true } } },
      });
      if (!existing) {
        return HttpError.notFound(reply, "Ignore reason");
      }

      if (existing._count.analyses > 0) {
        return HttpError.conflict(reply, `Cannot delete: ${existing._count.analyses} analisi usano questo motivo`);
      }

      await prisma.ignoreReason.delete({ where: { code: request.params.code } });

      request.auditEvents.push({
        action: SystemEventActions.IGNORE_REASON_DELETED,
        resource: SystemEventResources.IGNORE_REASONS,
        resourceId: existing.code,
        resourceLabel: existing.label,
      });

      return reply.send({ message: "Ignore reason deleted" });
    }
  );
}

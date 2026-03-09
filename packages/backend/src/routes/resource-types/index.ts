import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import { requirePermission } from "../../lib/require-permission.js";
import {
  ResourceTypeResponseSchema,
  ResourceTypesResponseSchema,
  ResourceTypeParamsSchema,
  CreateResourceTypeBodySchema,
  UpdateResourceTypeBodySchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type ResourceTypeParams,
  type CreateResourceTypeBody,
  type UpdateResourceTypeBody,
} from "./schemas.js";

export async function resourceTypeRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  // ─── GET /resource-types ─────────────────────────────────────────────────

  server.get(
    "/resource-types",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Resource Types"],
        summary: "List all resource types",
        security: [{ bearerAuth: [] }],
        response: { 200: ResourceTypesResponseSchema },
      },
    },
    async (_request, reply) => {
      const types = await prisma.resourceType.findMany({
        orderBy: { sortOrder: "asc" },
      });

      return reply.send(
        types.map((t) => ({
          id: t.id,
          name: t.name,
          sortOrder: t.sortOrder,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        }))
      );
    }
  );

  // ─── GET /resource-types/:id ─────────────────────────────────────────────

  server.get<{ Params: ResourceTypeParams }>(
    "/resource-types/:id",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Resource Types"],
        summary: "Get a single resource type",
        security: [{ bearerAuth: [] }],
        params: ResourceTypeParamsSchema,
        response: {
          200: ResourceTypeResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const rt = await prisma.resourceType.findUnique({
        where: { id: request.params.id },
      });

      if (!rt) {
        return HttpError.notFound(reply, "Resource type");
      }

      return reply.send({
        id: rt.id,
        name: rt.name,
        sortOrder: rt.sortOrder,
        createdAt: rt.createdAt.toISOString(),
        updatedAt: rt.updatedAt.toISOString(),
      });
    }
  );

  // ─── POST /resource-types ───────────────────────────────────────────────

  server.post<{ Body: CreateResourceTypeBody }>(
    "/resource-types",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "write")],
      schema: {
        tags: ["Resource Types"],
        summary: "Create a resource type",
        security: [{ bearerAuth: [] }],
        body: CreateResourceTypeBodySchema,
        response: {
          201: ResourceTypeResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.resourceType.findUnique({
        where: { name: request.body.name },
      });
      if (existing) {
        return HttpError.conflict(reply, `Resource type '${request.body.name}' already exists`);
      }

      const rt = await prisma.resourceType.create({
        data: {
          name:      request.body.name,
          sortOrder: request.body.sortOrder ?? 0,
        },
      });

      request.auditEvents.push({
        action: SystemEventActions.RESOURCE_TYPE_CREATED,
        resource: SystemEventResources.RESOURCE_TYPES,
        resourceId: rt.id,
        resourceLabel: rt.name,
        metadata: { created: rt },
      });

      return reply.status(201).send({
        id: rt.id,
        name: rt.name,
        sortOrder: rt.sortOrder,
        createdAt: rt.createdAt.toISOString(),
        updatedAt: rt.updatedAt.toISOString(),
      });
    }
  );

  // ─── PATCH /resource-types/:id ──────────────────────────────────────────

  server.patch<{ Params: ResourceTypeParams; Body: UpdateResourceTypeBody }>(
    "/resource-types/:id",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "write")],
      schema: {
        tags: ["Resource Types"],
        summary: "Update a resource type",
        security: [{ bearerAuth: [] }],
        params: ResourceTypeParamsSchema,
        body: UpdateResourceTypeBodySchema,
        response: {
          200: ResourceTypeResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.resourceType.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return HttpError.notFound(reply, "Resource type");
      }

      // Check name uniqueness if changing name
      if (request.body.name && request.body.name !== existing.name) {
        const duplicate = await prisma.resourceType.findUnique({
          where: { name: request.body.name },
        });
        if (duplicate) {
          return HttpError.conflict(reply, `Resource type '${request.body.name}' already exists`);
        }
      }

      const updated = await prisma.resourceType.update({
        where: { id: request.params.id },
        data: {
          name:      request.body.name,
          sortOrder: request.body.sortOrder,
        },
      });

      request.auditEvents.push({
        action: SystemEventActions.RESOURCE_TYPE_UPDATED,
        resource: SystemEventResources.RESOURCE_TYPES,
        resourceId: updated.id,
        resourceLabel: updated.name,
        metadata: {
          changes: buildDiff(existing, updated, ["name", "sortOrder"]),
        },
      });

      return reply.send({
        id: updated.id,
        name: updated.name,
        sortOrder: updated.sortOrder,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    }
  );

  // ─── DELETE /resource-types/:id ─────────────────────────────────────────

  server.delete<{ Params: ResourceTypeParams }>(
    "/resource-types/:id",
    {
      onRequest: [server.authenticate, requirePermission(SystemComponent.SYSTEM_SETTING, "write")],
      schema: {
        tags: ["Resource Types"],
        summary: "Delete a resource type",
        security: [{ bearerAuth: [] }],
        params: ResourceTypeParamsSchema,
        response: {
          200: MessageResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.resourceType.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { resources: true } } },
      });
      if (!existing) {
        return HttpError.notFound(reply, "Resource type");
      }

      if (existing._count.resources > 0) {
        return HttpError.conflict(reply, `Impossibile eliminare: ${existing._count.resources} risorse usano questo tipo`);
      }

      await prisma.resourceType.delete({ where: { id: request.params.id } });

      request.auditEvents.push({
        action: SystemEventActions.RESOURCE_TYPE_DELETED,
        resource: SystemEventResources.RESOURCE_TYPES,
        resourceId: existing.id,
        resourceLabel: existing.name,
      });

      return reply.send({ message: "Resource type deleted" });
    }
  );
}

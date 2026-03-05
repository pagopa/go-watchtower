import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, Prisma, Resource } from "@go-watchtower/database";
import { hasPermission } from "../../services/permission.service.js";
import { buildDiff } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import {
  SystemSettingsResponseSchema,
  SystemSettingSchema,
  SettingKeyParamsSchema,
  UpdateSettingBodySchema,
  ErrorResponseSchema,
  type SettingKeyParams,
  type UpdateSettingBody,
} from "./schemas.js";

type FormatValidator = (value: unknown) => string | null;

const FORMAT_VALIDATORS: Record<string, FormatValidator> = {
  WORKING_HOURS: (value) => {
    const v = value as { start?: unknown; end?: unknown; days?: unknown };
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      typeof v?.start !== "string" || !timeRe.test(v.start) ||
      typeof v?.end   !== "string" || !timeRe.test(v.end)   ||
      !Array.isArray(v?.days)      || v.days.some((d) => typeof d !== "number" || d < 1 || d > 7)
    ) {
      return "working_hours deve avere start/end in formato HH:MM e days come array di numeri 1-7";
    }
    return null;
  },
};

function formatSetting(s: {
  id: string;
  key: string;
  value: Prisma.JsonValue;
  type: string;
  format: string | null;
  category: string;
  label: string;
  description: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id:          s.id,
    key:         s.key,
    value:       s.value,
    type:        s.type,
    format:      s.format,
    category:    s.category,
    label:       s.label,
    description: s.description,
    updatedById: s.updatedById,
    createdAt:   s.createdAt.toISOString(),
    updatedAt:   s.updatedAt.toISOString(),
  };
}

export async function settingRoutes(app: FastifyInstance): Promise<void> {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  // ─── GET /settings ────────────────────────────────────────────────────────

  server.get(
    "/settings",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Settings"],
        summary: "List all system settings",
        security: [{ bearerAuth: [] }],
        response: {
          200: SystemSettingsResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const canRead = await hasPermission(
        request.user.userId,
        Resource.SYSTEM_SETTING,
        "read"
      );
      if (!canRead) {
        return reply.status(403).send({ error: "Permission denied" });
      }

      const settings = await prisma.systemSetting.findMany({
        orderBy: [{ category: "asc" }, { key: "asc" }],
      });

      return reply.send(settings.map(formatSetting));
    }
  );

  // ─── GET /settings/:key ───────────────────────────────────────────────────

  server.get<{ Params: SettingKeyParams }>(
    "/settings/:key",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Settings"],
        summary: "Get a single setting by key",
        security: [{ bearerAuth: [] }],
        params: SettingKeyParamsSchema,
        response: {
          200: SystemSettingSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const canRead = await hasPermission(
        request.user.userId,
        Resource.SYSTEM_SETTING,
        "read"
      );
      if (!canRead) {
        return reply.status(403).send({ error: "Permission denied" });
      }

      const setting = await prisma.systemSetting.findUnique({
        where: { key: request.params.key },
      });
      if (!setting) {
        return reply.status(404).send({ error: "Setting not found" });
      }

      return reply.send(formatSetting(setting));
    }
  );

  // ─── PATCH /settings/:key ─────────────────────────────────────────────────

  server.patch<{ Params: SettingKeyParams; Body: UpdateSettingBody }>(
    "/settings/:key",
    {
      onRequest: [server.authenticate],
      schema: {
        tags: ["Settings"],
        summary: "Update a setting value",
        security: [{ bearerAuth: [] }],
        params: SettingKeyParamsSchema,
        body: UpdateSettingBodySchema,
        response: {
          200: SystemSettingSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const canWrite = await hasPermission(
        request.user.userId,
        Resource.SYSTEM_SETTING,
        "write"
      );
      if (!canWrite) {
        return reply.status(403).send({ error: "Permission denied" });
      }

      const existing = await prisma.systemSetting.findUnique({
        where: { key: request.params.key },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Setting not found" });
      }

      // Basic type validation
      const { value } = request.body;
      const { type } = existing;

      if (type === "NUMBER" && typeof value !== "number") {
        return reply.status(400).send({ error: `Value must be a number for setting '${existing.key}'` });
      }
      if (type === "BOOLEAN" && typeof value !== "boolean") {
        return reply.status(400).send({ error: `Value must be a boolean for setting '${existing.key}'` });
      }
      if (type === "STRING" && typeof value !== "string") {
        return reply.status(400).send({ error: `Value must be a string for setting '${existing.key}'` });
      }

      if (existing.format) {
        const formatError = FORMAT_VALIDATORS[existing.format]?.(value) ?? null;
        if (formatError) return reply.status(400).send({ error: formatError });
      }

      const updated = await prisma.systemSetting.update({
        where: { key: request.params.key },
        data: {
          value:       request.body.value as unknown as Prisma.InputJsonValue,
          updatedById: request.user.userId,
        },
      });

      request.auditEvents.push({
        action:        SystemEventActions.SETTING_UPDATED,
        resource:      SystemEventResources.SYSTEM_SETTINGS,
        resourceId:    updated.key,
        resourceLabel: updated.label,
        metadata:      { key: updated.key, changes: buildDiff({ value: existing.value }, { value: updated.value }) },
      });

      return reply.send(formatSetting(updated));
    }
  );
}

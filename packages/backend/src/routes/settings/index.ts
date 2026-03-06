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

type FormatValidator = (value: unknown) => string | null | Promise<string | null>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORMAT_VALIDATORS: Record<string, FormatValidator> = {
  WORKING_HOURS: (value) => {
    const v = value as { timezone?: unknown; start?: unknown; end?: unknown; days?: unknown };
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof v?.timezone !== "string" || v.timezone.trim() === "") {
      return "working_hours.timezone deve essere una stringa IANA non vuota (es. 'Europe/Rome')";
    }
    try { Intl.DateTimeFormat(undefined, { timeZone: v.timezone }); }
    catch { return `working_hours.timezone '${v.timezone}' non è una timezone IANA valida`; }
    if (
      typeof v?.start !== "string" || !timeRe.test(v.start) ||
      typeof v?.end   !== "string" || !timeRe.test(v.end)   ||
      !Array.isArray(v?.days)      || v.days.some((d) => typeof d !== "number" || d < 1 || d > 7)
    ) {
      return "working_hours deve avere start/end in formato HH:MM e days come array di numeri 1-7";
    }
    return null;
  },

  ON_CALL_HOURS: (value) => {
    const v = value as {
      timezone?:  unknown;
      overnight?: { start?: unknown; end?: unknown; days?: unknown } | null;
      allDay?:    { startDay?: unknown; endDay?: unknown; endTime?: unknown } | null;
    };
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (typeof v?.timezone !== "string" || v.timezone.trim() === "") {
      return "on_call_hours.timezone deve essere una stringa IANA non vuota (es. 'Europe/Rome')";
    }
    try { Intl.DateTimeFormat(undefined, { timeZone: v.timezone }); }
    catch { return `on_call_hours.timezone '${v.timezone}' non è una timezone IANA valida`; }

    if (v.overnight != null) {
      const o = v.overnight;
      if (
        typeof o.start !== "string" || !timeRe.test(o.start) ||
        typeof o.end   !== "string" || !timeRe.test(o.end)   ||
        !Array.isArray(o.days)      || o.days.some((d) => typeof d !== "number" || d < 1 || d > 7)
      ) {
        return "on_call_hours.overnight deve avere start/end in formato HH:MM e days come array di numeri 1-7";
      }
    }

    if (v.allDay != null) {
      const a = v.allDay;
      if (
        typeof a.startDay !== "number" || a.startDay < 1 || a.startDay > 7 ||
        typeof a.endDay   !== "number" || a.endDay   < 1 || a.endDay   > 7 ||
        typeof a.endTime  !== "string" || !timeRe.test(a.endTime)
      ) {
        return "on_call_hours.allDay deve avere startDay/endDay (1-7) e endTime in formato HH:MM";
      }
    }

    return null;
  },

  FK_ROLE: async (value) => {
    if (typeof value !== "string" || !UUID_RE.test(value)) {
      return "Il valore deve essere un UUID valido";
    }
    const role = await prisma.role.findUnique({ where: { id: value }, select: { id: true } });
    return role ? null : `Nessun ruolo trovato con ID '${value}'`;
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
        const formatError = await (FORMAT_VALIDATORS[existing.format]?.(value) ?? null);
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

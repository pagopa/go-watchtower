import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { prisma, SystemComponent } from "@go-watchtower/database";
import { SystemEventActions, SystemEventResources, normalizeAlertPriorityCode } from "@go-watchtower/shared";
import { buildDiff } from "../../services/system-event.service.js";
import { requirePermission } from "../../lib/require-permission.js";
import { HttpError } from "../../utils/http-errors.js";
import { validateRegexPattern } from "../../utils/validate-regex.js";
import {
  didAlarmPriorityRuleResolutionChange,
  formatAlarmPriorityRule,
  reclassifyAlarmEventsForRuleCreate,
  reclassifyAlarmEventsForRuleDelete,
  reclassifyAlarmEventsForRuleUpdate,
} from "../../services/alarm-priority.service.js";
import {
  AlarmPriorityRulesResponseSchema,
  AlarmPriorityRuleResponseSchema,
  AlarmPriorityRuleParamsSchema,
  CreateAlarmPriorityRuleBodySchema,
  UpdateAlarmPriorityRuleBodySchema,
  ProductIdParamsSchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type AlarmPriorityRuleParams,
  type CreateAlarmPriorityRuleBody,
  type UpdateAlarmPriorityRuleBody,
} from "./schemas.js";

function asAuditRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}

type RuleWithRelations = Awaited<ReturnType<typeof prisma.alarmPriorityRule.findFirst>> & {
  priority: {
    code: string;
    label: string;
    rank: number;
    color: string | null;
    icon: string | null;
    countsAsOnCall: boolean;
    isDefault: boolean;
  };
  environment: { id: string; name: string } | null;
  alarm: { id: string; name: string } | null;
};

function formatRuleResponse(rule: RuleWithRelations) {
  return {
    ...formatAlarmPriorityRule(rule),
    priority: {
      code:           rule.priority.code,
      label:          rule.priority.label,
      rank:           rule.priority.rank,
      color:          rule.priority.color ?? null,
      icon:           rule.priority.icon ?? null,
      countsAsOnCall: rule.priority.countsAsOnCall,
      isDefault:      rule.priority.isDefault,
    },
    environment: rule.environment,
    alarm: rule.alarm,
  };
}

async function validateScopedReferences(params: {
  productId: string;
  environmentId?: string | null;
  alarmId?: string | null;
  priorityCode: string;
}) {
  const [product, environment, alarm, priority] = await Promise.all([
    prisma.product.findUnique({ where: { id: params.productId }, select: { id: true } }),
    params.environmentId
      ? prisma.environment.findFirst({
          where: { id: params.environmentId, productId: params.productId },
          select: { id: true },
        })
      : Promise.resolve(null),
    params.alarmId
      ? prisma.alarm.findFirst({
          where: { id: params.alarmId, productId: params.productId },
          select: { id: true },
        })
      : Promise.resolve(null),
    prisma.priorityLevel.findUnique({
      where: { code: params.priorityCode },
      select: { code: true },
    }),
  ]);

  return { product, environment, alarm, priority };
}

function validateMatcherShape(body: {
  matcherType: "ALARM_ID" | "ALARM_NAME_PREFIX" | "ALARM_NAME_REGEX";
  alarmId?: string | null;
  namePrefix?: string | null;
  namePattern?: string | null;
}): string | null {
  if (body.matcherType === "ALARM_ID") {
    return body.alarmId ? null : "alarmId is required when matcherType is ALARM_ID";
  }

  if (body.matcherType === "ALARM_NAME_PREFIX") {
    return body.namePrefix && body.namePrefix.trim() !== ""
      ? null
      : "namePrefix is required when matcherType is ALARM_NAME_PREFIX";
  }

  if (body.matcherType === "ALARM_NAME_REGEX") {
    if (!body.namePattern || body.namePattern.trim() === "") {
      return "namePattern is required when matcherType is ALARM_NAME_REGEX";
    }

    const regexError = validateRegexPattern(body.namePattern);
    return regexError ? `namePattern: ${regexError}` : null;
  }

  return "Unsupported matcherType";
}

export async function alarmPriorityRuleRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get<{ Params: { productId: string } }>(
    "/products/:productId/alarm-priority-rules",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_PRIORITY_RULE, "read")],
      schema: {
        tags: ["alarm-priority-rules"],
        summary: "Get all alarm priority rules for a product",
        security: [{ bearerAuth: [] }],
        params: ProductIdParamsSchema,
        response: {
          200: AlarmPriorityRulesResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const rules = await prisma.alarmPriorityRule.findMany({
        where: { productId: request.params.productId },
        include: {
          priority: {
            select: {
              code: true,
              label: true,
              rank: true,
              color: true,
              icon: true,
              countsAsOnCall: true,
              isDefault: true,
            },
          },
          environment: { select: { id: true, name: true } },
          alarm: { select: { id: true, name: true } },
        },
        orderBy: [{ isActive: "desc" }, { precedence: "desc" }, { createdAt: "asc" }],
      });

      reply.send(rules.map((rule) => formatRuleResponse(rule as RuleWithRelations)));
    },
  );

  app.get<{ Params: AlarmPriorityRuleParams }>(
    "/products/:productId/alarm-priority-rules/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_PRIORITY_RULE, "read")],
      schema: {
        tags: ["alarm-priority-rules"],
        summary: "Get an alarm priority rule by ID",
        security: [{ bearerAuth: [] }],
        params: AlarmPriorityRuleParamsSchema,
        response: {
          200: AlarmPriorityRuleResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const rule = await prisma.alarmPriorityRule.findFirst({
        where: { id: request.params.id, productId: request.params.productId },
        include: {
          priority: {
            select: {
              code: true,
              label: true,
              rank: true,
              color: true,
              icon: true,
              countsAsOnCall: true,
              isDefault: true,
            },
          },
          environment: { select: { id: true, name: true } },
          alarm: { select: { id: true, name: true } },
        },
      });

      if (!rule) {
        return HttpError.notFound(reply, "Alarm priority rule");
      }

      reply.send(formatRuleResponse(rule as RuleWithRelations));
    },
  );

  app.post<{ Params: { productId: string }; Body: CreateAlarmPriorityRuleBody }>(
    "/products/:productId/alarm-priority-rules",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_PRIORITY_RULE, "write")],
      schema: {
        tags: ["alarm-priority-rules"],
        summary: "Create an alarm priority rule",
        security: [{ bearerAuth: [] }],
        body: CreateAlarmPriorityRuleBodySchema,
        response: {
          201: AlarmPriorityRuleResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const priorityCode = normalizeAlertPriorityCode(request.body.priorityCode);
      const matcherError = validateMatcherShape(request.body);
      if (matcherError) {
        return HttpError.badRequest(reply, matcherError);
      }

      const refs = await validateScopedReferences({
        productId: request.params.productId,
        environmentId: request.body.environmentId ?? null,
        alarmId: request.body.alarmId ?? null,
        priorityCode,
      });

      if (!refs.product) return HttpError.notFound(reply, "Product");
      if (request.body.environmentId && !refs.environment) return HttpError.notFound(reply, "Environment");
      if (request.body.alarmId && !refs.alarm) return HttpError.notFound(reply, "Alarm");
      if (!refs.priority) return HttpError.notFound(reply, "Priority level");

      const created = await prisma.alarmPriorityRule.create({
        data: {
          productId:     request.params.productId,
          environmentId: request.body.environmentId ?? null,
          priorityCode,
          name:          request.body.name,
          matcherType:   request.body.matcherType,
          alarmId:       request.body.matcherType === "ALARM_ID" ? request.body.alarmId ?? null : null,
          namePrefix:    request.body.matcherType === "ALARM_NAME_PREFIX" ? request.body.namePrefix ?? null : null,
          namePattern:   request.body.matcherType === "ALARM_NAME_REGEX" ? request.body.namePattern ?? null : null,
          precedence:    request.body.precedence ?? 0,
          note:          request.body.note ?? null,
          isActive:      request.body.isActive ?? true,
          validity:      request.body.validity ?? [],
          exclusions:    request.body.exclusions ?? [],
        },
        include: {
          priority: {
            select: {
              code: true,
              label: true,
              rank: true,
              color: true,
              icon: true,
              countsAsOnCall: true,
              isDefault: true,
            },
          },
          environment: { select: { id: true, name: true } },
          alarm: { select: { id: true, name: true } },
        },
      });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_PRIORITY_RULE_CREATED,
        resource:      SystemEventResources.ALARM_PRIORITY_RULES,
        resourceId:    created.id,
        resourceLabel: created.name,
        metadata:      {
          created: formatRuleResponse(created as RuleWithRelations),
          reclassification: await reclassifyAlarmEventsForRuleCreate(
            formatAlarmPriorityRule(created as RuleWithRelations),
          ),
        },
      });

      reply.status(201).send(formatRuleResponse(created as RuleWithRelations));
    },
  );

  app.put<{ Params: AlarmPriorityRuleParams; Body: UpdateAlarmPriorityRuleBody }>(
    "/products/:productId/alarm-priority-rules/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_PRIORITY_RULE, "write")],
      schema: {
        tags: ["alarm-priority-rules"],
        summary: "Update an alarm priority rule",
        security: [{ bearerAuth: [] }],
        params: AlarmPriorityRuleParamsSchema,
        body: UpdateAlarmPriorityRuleBodySchema,
        response: {
          200: AlarmPriorityRuleResponseSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.alarmPriorityRule.findFirst({
        where: { id: request.params.id, productId: request.params.productId },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Alarm priority rule");
      }

      const existingRule = formatAlarmPriorityRule(existing);
      const priorityCode = request.body.priorityCode !== undefined
        ? normalizeAlertPriorityCode(request.body.priorityCode)
        : existing.priorityCode;

      const matcherType = request.body.matcherType ?? existing.matcherType;
      const matcherShape = {
        matcherType,
        alarmId: request.body.alarmId ?? existing.alarmId,
        namePrefix: request.body.namePrefix ?? existing.namePrefix,
        namePattern: request.body.namePattern ?? existing.namePattern,
      };
      const matcherError = validateMatcherShape(matcherShape);
      if (matcherError) {
        return HttpError.badRequest(reply, matcherError);
      }

      const refs = await validateScopedReferences({
        productId: request.params.productId,
        environmentId: request.body.environmentId !== undefined ? request.body.environmentId : existing.environmentId,
        alarmId: matcherType === "ALARM_ID"
          ? (request.body.alarmId !== undefined ? request.body.alarmId : existing.alarmId)
          : null,
        priorityCode,
      });

      if (request.body.environmentId && !refs.environment) return HttpError.notFound(reply, "Environment");
      if (matcherType === "ALARM_ID" && matcherShape.alarmId && !refs.alarm) return HttpError.notFound(reply, "Alarm");
      if (!refs.priority) return HttpError.notFound(reply, "Priority level");

      const updated = await prisma.alarmPriorityRule.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.environmentId !== undefined && { environmentId: request.body.environmentId }),
          ...(request.body.priorityCode !== undefined && { priorityCode }),
          ...(request.body.name !== undefined && { name: request.body.name }),
          ...(request.body.matcherType !== undefined && { matcherType: request.body.matcherType }),
          ...(request.body.precedence !== undefined && { precedence: request.body.precedence }),
          ...(request.body.note !== undefined && { note: request.body.note }),
          ...(request.body.isActive !== undefined && { isActive: request.body.isActive }),
          ...(request.body.validity !== undefined && { validity: request.body.validity }),
          ...(request.body.exclusions !== undefined && { exclusions: request.body.exclusions }),
          alarmId: matcherType === "ALARM_ID"
            ? (request.body.alarmId !== undefined ? request.body.alarmId : existing.alarmId)
            : null,
          namePrefix: matcherType === "ALARM_NAME_PREFIX"
            ? (request.body.namePrefix !== undefined ? request.body.namePrefix : existing.namePrefix)
            : null,
          namePattern: matcherType === "ALARM_NAME_REGEX"
            ? (request.body.namePattern !== undefined ? request.body.namePattern : existing.namePattern)
            : null,
        },
        include: {
          priority: {
            select: {
              code: true,
              label: true,
              rank: true,
              color: true,
              icon: true,
              countsAsOnCall: true,
              isDefault: true,
            },
          },
          environment: { select: { id: true, name: true } },
          alarm: { select: { id: true, name: true } },
        },
      });
      const updatedRule = formatAlarmPriorityRule(updated as RuleWithRelations);
      const reclassification = didAlarmPriorityRuleResolutionChange(existingRule, updatedRule)
        ? await reclassifyAlarmEventsForRuleUpdate({
            previousRule: existingRule,
            nextRule: updatedRule,
          })
        : null;

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_PRIORITY_RULE_UPDATED,
        resource:      SystemEventResources.ALARM_PRIORITY_RULES,
        resourceId:    updated.id,
        resourceLabel: updated.name,
        metadata: {
          changes: buildDiff(
            asAuditRecord(existingRule),
            asAuditRecord(updatedRule),
          ),
          ...(reclassification ? { reclassification } : {}),
        },
      });

      reply.send(formatRuleResponse(updated as RuleWithRelations));
    },
  );

  app.delete<{ Params: AlarmPriorityRuleParams }>(
    "/products/:productId/alarm-priority-rules/:id",
    {
      onRequest: [app.authenticate, requirePermission(SystemComponent.ALARM_PRIORITY_RULE, "delete")],
      schema: {
        tags: ["alarm-priority-rules"],
        summary: "Delete an alarm priority rule",
        security: [{ bearerAuth: [] }],
        params: AlarmPriorityRuleParamsSchema,
        response: {
          200: MessageResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.alarmPriorityRule.findFirst({
        where: { id: request.params.id, productId: request.params.productId },
      });

      if (!existing) {
        return HttpError.notFound(reply, "Alarm priority rule");
      }

      const existingRule = formatAlarmPriorityRule(existing);
      const reclassification = await reclassifyAlarmEventsForRuleDelete(existingRule);

      await prisma.alarmPriorityRule.delete({
        where: { id: existing.id },
      });

      request.auditEvents.push({
        action:        SystemEventActions.ALARM_PRIORITY_RULE_DELETED,
        resource:      SystemEventResources.ALARM_PRIORITY_RULES,
        resourceId:    existing.id,
        resourceLabel: existing.name,
        metadata:      {
          deleted: asAuditRecord(existingRule),
          reclassification,
        },
      });

      reply.send({ message: "Alarm priority rule deleted successfully" });
    },
  );
}

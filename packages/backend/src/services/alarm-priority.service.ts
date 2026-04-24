import { prisma, Prisma } from "@go-watchtower/database";
import { resolveAlarmPriority } from "@go-watchtower/shared";
import type { AlarmEventPriority, AlertPriorityLevel, AlarmPriorityRule } from "@go-watchtower/shared";
import { AlarmPriorityMatcherTypes } from "@go-watchtower/shared";
import { fromJsonOr } from "../utils/json-cast.js";

const ALARM_PRIORITY_RECALC_BATCH_SIZE = 250;

export type AlertPriorityLevelDto = AlertPriorityLevel & {
  createdAt: string;
  updatedAt: string;
};

export type AlarmPriorityRuleDto = AlarmPriorityRule & {
  createdAt: string;
  updatedAt: string;
};

export interface AlarmPriorityReclassificationStats {
  products: number;
  scanned: number;
  touched: number;
  changed: number;
  batches: number;
}

type PriorityLevelRecord = {
  code: string;
  label: string;
  description: string | null;
  rank: number;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  isDefault: boolean;
  countsAsOnCall: boolean;
  defaultNotify: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AlarmPriorityRuleRecord = {
  id: string;
  productId: string;
  environmentId: string | null;
  priorityCode: string;
  name: string;
  matcherType: "ALARM_ID" | "ALARM_NAME_PREFIX" | "ALARM_NAME_REGEX";
  alarmId: string | null;
  namePrefix: string | null;
  namePattern: string | null;
  precedence: number;
  note: string | null;
  isActive: boolean;
  validity: Prisma.JsonValue | null;
  exclusions: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

type AlarmPriorityContext = {
  levels: AlertPriorityLevel[];
  rules: AlarmPriorityRule[];
};

type PersistedPriorityResolution = {
  priorityCode: string;
  priorityRuleId: string | null;
  priorityResolvedAt: Date;
};

type RuleResolutionShape = Pick<
  AlarmPriorityRule,
  | "productId"
  | "environmentId"
  | "priorityCode"
  | "matcherType"
  | "alarmId"
  | "namePrefix"
  | "namePattern"
  | "precedence"
  | "isActive"
  | "validity"
  | "exclusions"
>;

export function formatPriorityLevel(level: PriorityLevelRecord): AlertPriorityLevelDto {
  return {
    code:           level.code,
    label:          level.label,
    description:    level.description ?? null,
    rank:           level.rank,
    color:          level.color ?? null,
    icon:           level.icon ?? null,
    isActive:       level.isActive,
    isDefault:      level.isDefault,
    countsAsOnCall: level.countsAsOnCall,
    defaultNotify:  level.defaultNotify,
    isSystem:       level.isSystem,
    createdAt:      level.createdAt.toISOString(),
    updatedAt:      level.updatedAt.toISOString(),
  };
}

export function formatAlarmPriorityRule(rule: AlarmPriorityRuleRecord): AlarmPriorityRuleDto {
  return {
    id:            rule.id,
    productId:     rule.productId,
    environmentId: rule.environmentId ?? null,
    priorityCode:  rule.priorityCode,
    name:          rule.name,
    matcherType:   rule.matcherType,
    alarmId:       rule.alarmId ?? null,
    namePrefix:    rule.namePrefix ?? null,
    namePattern:   rule.namePattern ?? null,
    precedence:    rule.precedence,
    note:          rule.note ?? null,
    isActive:      rule.isActive,
    validity:      fromJsonOr(rule.validity, []),
    exclusions:    fromJsonOr(rule.exclusions, []),
    createdAt:     rule.createdAt.toISOString(),
    updatedAt:     rule.updatedAt.toISOString(),
  };
}

export async function loadAlarmPriorityContext(
  productId: string,
  options?: {
    excludeRuleIds?: string[];
  },
): Promise<AlarmPriorityContext> {
  const [levels, rules] = await Promise.all([
    prisma.priorityLevel.findMany({
      orderBy: [{ rank: "desc" }, { code: "asc" }],
    }),
    prisma.alarmPriorityRule.findMany({
      where: {
        productId,
        isActive: true,
        ...(options?.excludeRuleIds?.length
          ? { id: { notIn: options.excludeRuleIds } }
          : {}),
      },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);

  return {
    levels: levels.map(formatPriorityLevel),
    rules: rules.map(formatAlarmPriorityRule),
  };
}

export async function resolvePersistedAlarmPriority(params: {
  productId: string;
  environmentId: string;
  alarmId?: string | null;
  alarmName: string;
  firedAt: Date;
}): Promise<PersistedPriorityResolution> {
  const context = await loadAlarmPriorityContext(params.productId);
  return resolvePersistedAlarmPriorityWithContext({
    context,
    productId:     params.productId,
    environmentId: params.environmentId,
    alarmId:       params.alarmId ?? null,
    alarmName:     params.alarmName,
    firedAt:       params.firedAt,
  });
}

export function toAlarmEventPriorityDto(params: {
  priority: {
    code: string;
    label: string;
    rank: number;
    color: string | null;
    icon: string | null;
    countsAsOnCall: boolean;
    isDefault: boolean;
  };
  priorityRuleId: string | null;
  priorityRuleName?: string | null;
  priorityResolvedAt: Date | null;
}): AlarmEventPriority {
  return {
    code:           params.priority.code,
    label:          params.priority.label,
    rank:           params.priority.rank,
    color:          params.priority.color ?? null,
    icon:           params.priority.icon ?? null,
    countsAsOnCall: params.priority.countsAsOnCall,
    isDefault:      params.priority.isDefault,
    ruleId:         params.priorityRuleId,
    ruleName:       params.priorityRuleName ?? null,
    resolvedAt:     params.priorityResolvedAt?.toISOString() ?? null,
  };
}

export function didAlarmPriorityRuleResolutionChange(
  previous: RuleResolutionShape,
  next: RuleResolutionShape,
): boolean {
  if (!previous.isActive && !next.isActive) {
    return false;
  }

  return (
    previous.environmentId !== next.environmentId ||
    previous.priorityCode !== next.priorityCode ||
    previous.matcherType !== next.matcherType ||
    previous.alarmId !== next.alarmId ||
    previous.namePrefix !== next.namePrefix ||
    previous.namePattern !== next.namePattern ||
    previous.precedence !== next.precedence ||
    previous.isActive !== next.isActive ||
    JSON.stringify(previous.validity) !== JSON.stringify(next.validity) ||
    JSON.stringify(previous.exclusions) !== JSON.stringify(next.exclusions)
  );
}

export async function reclassifyAlarmEventsForRuleCreate(
  rule: AlarmPriorityRule,
): Promise<AlarmPriorityReclassificationStats> {
  if (!rule.isActive) {
    return emptyReclassificationStats();
  }

  const where = buildAlarmEventImpactWhere(rule.productId, [rule], []);
  return reclassifyProductAlarmEvents({
    productId: rule.productId,
    where,
  });
}

export async function reclassifyAlarmEventsForRuleUpdate(params: {
  previousRule: AlarmPriorityRule;
  nextRule: AlarmPriorityRule;
}): Promise<AlarmPriorityReclassificationStats> {
  const where = buildAlarmEventImpactWhere(
    params.nextRule.productId,
    [params.previousRule, params.nextRule],
    [params.nextRule.id],
  );

  return reclassifyProductAlarmEvents({
    productId: params.nextRule.productId,
    where,
  });
}

export async function reclassifyAlarmEventsForRuleDelete(
  rule: AlarmPriorityRule,
): Promise<AlarmPriorityReclassificationStats> {
  if (!rule.isActive) {
    return emptyReclassificationStats();
  }

  const where = buildAlarmEventImpactWhere(rule.productId, [rule], [rule.id]);
  const context = await loadAlarmPriorityContext(rule.productId, {
    excludeRuleIds: [rule.id],
  });

  return reclassifyProductAlarmEvents({
    productId: rule.productId,
    where,
    context,
  });
}

export async function reclassifyAlarmEventsForProducts(
  productIds: string[],
): Promise<AlarmPriorityReclassificationStats> {
  const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
  let aggregate = emptyReclassificationStats();

  for (const productId of uniqueProductIds) {
    const result = await reclassifyProductAlarmEvents({ productId });
    aggregate = mergeReclassificationStats(aggregate, result);
  }

  aggregate.products = uniqueProductIds.length;
  return aggregate;
}

export async function getProductsImpactedByPriorityLevelChange(params: {
  priorityCode: string;
  affectsDefaultResolution: boolean;
}): Promise<string[]> {
  const [ruleProducts, directEventProducts, allEventProducts] = await Promise.all([
    prisma.alarmPriorityRule.findMany({
      where: {
        isActive: true,
        priorityCode: params.priorityCode,
      },
      distinct: ["productId"],
      select: { productId: true },
    }),
    prisma.alarmEvent.findMany({
      where: { priorityCode: params.priorityCode },
      distinct: ["productId"],
      select: { productId: true },
    }),
    params.affectsDefaultResolution
      ? prisma.alarmEvent.findMany({
          distinct: ["productId"],
          select: { productId: true },
        })
      : Promise.resolve([] as Array<{ productId: string }>),
  ]);

  return [
    ...new Set([
      ...ruleProducts.map((row) => row.productId),
      ...directEventProducts.map((row) => row.productId),
      ...allEventProducts.map((row) => row.productId),
    ]),
  ];
}

function emptyReclassificationStats(): AlarmPriorityReclassificationStats {
  return {
    products: 0,
    scanned:  0,
    touched:  0,
    changed:  0,
    batches:  0,
  };
}

function mergeReclassificationStats(
  aggregate: AlarmPriorityReclassificationStats,
  result: AlarmPriorityReclassificationStats,
): AlarmPriorityReclassificationStats {
  return {
    products: aggregate.products + result.products,
    scanned:  aggregate.scanned + result.scanned,
    touched:  aggregate.touched + result.touched,
    changed:  aggregate.changed + result.changed,
    batches:  aggregate.batches + result.batches,
  };
}

function buildAlarmEventImpactWhere(
  productId: string,
  rules: AlarmPriorityRule[],
  priorityRuleIds: string[],
): Prisma.AlarmEventWhereInput | undefined {
  const clauses: Prisma.AlarmEventWhereInput[] = [];

  for (const rule of rules) {
    const clause = buildAlarmEventScopeForRule(rule);
    if (clause) clauses.push(clause);
  }

  if (priorityRuleIds.length > 0) {
    clauses.push({
      productId,
      priorityRuleId: { in: priorityRuleIds },
    });
  }

  if (clauses.length === 0) return undefined;
  if (clauses.length === 1) return clauses[0];

  return { OR: clauses };
}

function buildAlarmEventScopeForRule(rule: AlarmPriorityRule): Prisma.AlarmEventWhereInput | null {
  const base: Prisma.AlarmEventWhereInput = {
    productId: rule.productId,
    ...(rule.environmentId ? { environmentId: rule.environmentId } : {}),
  };

  if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_ID) {
    return rule.alarmId ? { ...base, alarmId: rule.alarmId } : null;
  }

  if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_PREFIX) {
    return rule.namePrefix ? { ...base, name: { startsWith: rule.namePrefix } } : null;
  }

  if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_REGEX) {
    return base;
  }

  return null;
}

function resolvePersistedAlarmPriorityWithContext(params: {
  context: AlarmPriorityContext;
  productId: string;
  environmentId: string;
  alarmId: string | null;
  alarmName: string;
  firedAt: Date;
}): PersistedPriorityResolution {
  const resolved = resolveAlarmPriority({
    productId:     params.productId,
    environmentId: params.environmentId,
    alarmId:       params.alarmId,
    alarmName:     params.alarmName,
    firedAt:       params.firedAt,
    rules:         params.context.rules,
    levels:        params.context.levels,
  });

  return {
    priorityCode:       resolved.level.code,
    priorityRuleId:     resolved.rule?.id ?? null,
    priorityResolvedAt: new Date(),
  };
}

async function reclassifyProductAlarmEvents(params: {
  productId: string;
  where?: Prisma.AlarmEventWhereInput;
  context?: AlarmPriorityContext;
  batchSize?: number;
}): Promise<AlarmPriorityReclassificationStats> {
  const stats = {
    ...emptyReclassificationStats(),
    products: 1,
  };
  const context = params.context ?? await loadAlarmPriorityContext(params.productId);
  const batchSize = params.batchSize ?? ALARM_PRIORITY_RECALC_BATCH_SIZE;
  const baseWhere = params.where
    ? { AND: [{ productId: params.productId }, params.where] }
    : { productId: params.productId };

  let cursor: string | undefined;

  while (true) {
    const events = await prisma.alarmEvent.findMany({
      where: baseWhere,
      select: {
        id: true,
        productId: true,
        environmentId: true,
        alarmId: true,
        name: true,
        firedAt: true,
        priorityCode: true,
        priorityRuleId: true,
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (events.length === 0) break;

    stats.batches += 1;
    stats.scanned += events.length;

    const rows = events.map((event) => {
      const resolved = resolvePersistedAlarmPriorityWithContext({
        context,
        productId:     event.productId,
        environmentId: event.environmentId,
        alarmId:       event.alarmId,
        alarmName:     event.name,
        firedAt:       event.firedAt,
      });

      if (
        event.priorityCode !== resolved.priorityCode ||
        event.priorityRuleId !== resolved.priorityRuleId
      ) {
        stats.changed += 1;
      }

      return {
        id: event.id,
        priorityCode: resolved.priorityCode,
        priorityRuleId: resolved.priorityRuleId,
        priorityResolvedAt: resolved.priorityResolvedAt,
      };
    });

    stats.touched += await persistPriorityResolutionBatch(rows);
    cursor = events[events.length - 1]?.id;
  }

  return stats;
}

async function persistPriorityResolutionBatch(
  rows: PersistedPriorityResolutionRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const values = rows.map((row) => Prisma.sql`(
    ${row.id}::uuid,
    ${row.priorityCode},
    ${row.priorityRuleId}::uuid,
    ${row.priorityResolvedAt}::timestamp
  )`);

  return prisma.$executeRaw`
    UPDATE "alarm_events" AS ae
    SET
      "priority_code" = data."priority_code",
      "priority_rule_id" = data."priority_rule_id",
      "priority_resolved_at" = data."priority_resolved_at"
    FROM (
      VALUES ${Prisma.join(values)}
    ) AS data("id", "priority_code", "priority_rule_id", "priority_resolved_at")
    WHERE ae."id" = data."id"
  `;
}

type PersistedPriorityResolutionRow = PersistedPriorityResolution & {
  id: string;
};

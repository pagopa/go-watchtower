import { Prisma, type PrismaClient } from "@go-watchtower/database";
import {
  inferLinkType,
  normalizeAlertPriorityCode,
  type AnalysisLink,
  type TrackingEntry,
} from "@go-watchtower/shared";
import { fromJson, fromJsonOr } from "../../utils/json-cast.js";
import type { AlarmAnalysisQuery, AllAnalysesQuery } from "./schemas.js";

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const SAFE_URL_PATTERN = /^https?:\/\//i;

export function processLinks(
  links?: Array<{ url: string; name?: string; type?: string }>,
): Array<{ url: string; name?: string; type: string }> {
  if (!links) return [];
  return links
    .filter((link) => SAFE_URL_PATTERN.test(link.url))
    .map((link) => ({
      ...link,
      type: link.type || inferLinkType(link.url),
    }));
}

export const analysisListSelect = {
  id: true,
  analysisDate: true,
  firstAlarmAt: true,
  lastAlarmAt: true,
  occurrences: true,
  isOnCall: true,
  analysisType: true,
  status: true,
  alarmId: true,
  errorDetails: true,
  conclusionNotes: true,
  ignoreReasonCode: true,
  operatorId: true,
  productId: true,
  environmentId: true,
  runbookId: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  updatedById: true,
  product: { select: { id: true, name: true } },
  alarm: { select: { id: true, name: true } },
  operator: { select: { id: true, name: true, email: true } },
  environment: { select: { id: true, name: true } },
  finalActions: {
    include: { finalAction: { select: { id: true, name: true } } },
  },
  runbook: { select: { id: true, name: true, status: true } },
  resources: {
    include: {
      resource: {
        select: {
          id: true,
          name: true,
          type: { select: { id: true, name: true } },
        },
      },
    },
  },
  downstreams: {
    include: { downstream: { select: { id: true, name: true } } },
  },
  ignoreReason: true,
  links: true,
  trackingIds: true,
  _count: { select: { alarmEvents: true } },
} as const;

export const analysisInclude = {
  product: { select: { id: true, name: true } },
  alarm: { select: { id: true, name: true } },
  operator: { select: { id: true, name: true, email: true } },
  environment: { select: { id: true, name: true } },
  finalActions: {
    include: { finalAction: { select: { id: true, name: true } } },
  },
  runbook: { select: { id: true, name: true, link: true, status: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  updatedBy: { select: { id: true, name: true, email: true } },
  resources: {
    include: {
      resource: {
        select: {
          id: true,
          name: true,
          type: { select: { id: true, name: true } },
        },
      },
    },
  },
  downstreams: {
    include: { downstream: { select: { id: true, name: true } } },
  },
  ignoreReason: true,
  _count: { select: { alarmEvents: true } },
} as const;

export type AnalysisListRow = Prisma.AlarmAnalysisGetPayload<{
  select: typeof analysisListSelect;
}>;

export type AnalysisWithRelations = Prisma.AlarmAnalysisGetPayload<{
  include: typeof analysisInclude;
}>;

function toRelatedUserStub(
  id: string | null,
): { id: string; name: string; email: string } | null {
  if (!id) return null;
  return { id, name: "", email: "" };
}

export function formatAnalysisListResponse(analysis: AnalysisListRow) {
  return {
    id: analysis.id,
    analysisDate: analysis.analysisDate.toISOString(),
    firstAlarmAt: analysis.firstAlarmAt.toISOString(),
    lastAlarmAt: analysis.lastAlarmAt.toISOString(),
    occurrences: analysis.occurrences,
    isOnCall: analysis.isOnCall,
    analysisType: analysis.analysisType,
    status: analysis.status,
    alarmId: analysis.alarmId,
    errorDetails: analysis.errorDetails,
    conclusionNotes: analysis.conclusionNotes,
    ignoreReasonCode: analysis.ignoreReasonCode,
    ignoreDetails: null as Record<string, unknown> | null,
    ignoreReason: analysis.ignoreReason ?? null,
    operatorId: analysis.operatorId,
    productId: analysis.productId,
    environmentId: analysis.environmentId,
    runbookId: analysis.runbookId,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    createdById: analysis.createdById,
    updatedById: analysis.updatedById,
    product: analysis.product,
    alarm: analysis.alarm,
    operator: analysis.operator,
    environment: analysis.environment,
    finalActions: analysis.finalActions.map((row) => row.finalAction),
    runbook: analysis.runbook,
    createdBy: toRelatedUserStub(analysis.createdById) ?? {
      id: "",
      name: "",
      email: "",
    },
    updatedBy: toRelatedUserStub(analysis.updatedById),
    resources: analysis.resources.map((row) => ({
      id: row.resource.id,
      name: row.resource.name,
      type: row.resource.type,
    })),
    downstreams: analysis.downstreams.map((row) => row.downstream),
    links: fromJsonOr<AnalysisLink[]>(analysis.links, []),
    trackingIds: fromJsonOr<TrackingEntry[]>(analysis.trackingIds, []),
    validationScore: null as number | null,
    qualityScore: null as number | null,
    scoredAt: null as string | null,
    linkedEventsCount: analysis._count.alarmEvents,
    avgMttaMs: null as number | null,
    avgMttrMs: null as number | null,
    avgMttfMs: null as number | null,
  };
}

export function formatAnalysisResponse(analysis: AnalysisWithRelations) {
  return {
    id: analysis.id,
    analysisDate: analysis.analysisDate.toISOString(),
    firstAlarmAt: analysis.firstAlarmAt.toISOString(),
    lastAlarmAt: analysis.lastAlarmAt.toISOString(),
    occurrences: analysis.occurrences,
    isOnCall: analysis.isOnCall,
    analysisType: analysis.analysisType,
    status: analysis.status,
    alarmId: analysis.alarmId,
    errorDetails: analysis.errorDetails,
    conclusionNotes: analysis.conclusionNotes,
    ignoreReasonCode: analysis.ignoreReasonCode,
    ignoreDetails: fromJson<Record<string, unknown>>(analysis.ignoreDetails),
    ignoreReason: analysis.ignoreReason ?? null,
    operatorId: analysis.operatorId,
    productId: analysis.productId,
    environmentId: analysis.environmentId,
    runbookId: analysis.runbookId,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    createdById: analysis.createdById,
    updatedById: analysis.updatedById,
    product: analysis.product,
    alarm: analysis.alarm,
    operator: analysis.operator,
    environment: analysis.environment,
    finalActions: analysis.finalActions.map((row) => row.finalAction),
    runbook: analysis.runbook,
    createdBy: analysis.createdBy,
    updatedBy: analysis.updatedBy,
    resources: analysis.resources.map((row) => ({
      id: row.resource.id,
      name: row.resource.name,
      type: row.resource.type,
    })),
    downstreams: analysis.downstreams.map((row) => row.downstream),
    links: fromJsonOr<AnalysisLink[]>(analysis.links, []),
    trackingIds: fromJsonOr<TrackingEntry[]>(analysis.trackingIds, []),
    validationScore: analysis.validationScore ?? null,
    qualityScore: analysis.qualityScore ?? null,
    scoredAt: analysis.scoredAt ? analysis.scoredAt.toISOString() : null,
    linkedEventsCount: analysis._count.alarmEvents,
    avgMttaMs: null as number | null,
    avgMttrMs: null as number | null,
    avgMttfMs: null as number | null,
  };
}

function singleOrIn<T>(value: T | T[]): T | { in: T[] } {
  return Array.isArray(value) ? { in: value } : value;
}

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function addAndCondition(
  where: Prisma.AlarmAnalysisWhereInput,
  condition: Prisma.AlarmAnalysisWhereInput,
): void {
  if (!where.AND) {
    where.AND = [condition];
    return;
  }

  where.AND = Array.isArray(where.AND)
    ? [...where.AND, condition]
    : [where.AND, condition];
}

export function buildAnalysisWhereClause(
  query: AlarmAnalysisQuery | AllAnalysesQuery,
  productId?: string,
): Prisma.AlarmAnalysisWhereInput {
  const where: Prisma.AlarmAnalysisWhereInput = {};

  if (productId) where.productId = productId;
  else if ("productId" in query && query.productId) {
    where.productId = query.productId;
  }

  if (query.analysisType) where.analysisType = singleOrIn(query.analysisType);
  if (query.status) where.status = singleOrIn(query.status);
  if (query.isOnCall !== undefined) where.isOnCall = query.isOnCall;
  if (query.operatorId) where.operatorId = singleOrIn(query.operatorId);
  if (query.createdById) where.createdById = query.createdById;
  if (query.environmentId) where.environmentId = singleOrIn(query.environmentId);
  if (query.alarmId) where.alarmId = singleOrIn(query.alarmId);

  if (query.finalActionId) {
    const ids = Array.isArray(query.finalActionId)
      ? query.finalActionId
      : [query.finalActionId];
    where.finalActions = { some: { finalActionId: { in: ids } } };
  }

  if (query.dateFrom || query.dateTo) {
    where.analysisDate = {};
    if (query.dateFrom) where.analysisDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.analysisDate.lte = new Date(query.dateTo);
  }

  if (query.ignoreReasonCode) {
    where.ignoreReasonCode = singleOrIn(query.ignoreReasonCode);
  }
  if (query.runbookId) where.runbookId = singleOrIn(query.runbookId);

  if (query.resourceId) {
    const ids = Array.isArray(query.resourceId)
      ? query.resourceId
      : [query.resourceId];
    where.resources = { some: { resourceId: { in: ids } } };
  }

  if (query.downstreamId) {
    const ids = Array.isArray(query.downstreamId)
      ? query.downstreamId
      : [query.downstreamId];
    where.downstreams = { some: { downstreamId: { in: ids } } };
  }

  if ("priorityCode" in query && query.priorityCode) {
    const codes = (
      Array.isArray(query.priorityCode)
        ? query.priorityCode
        : [query.priorityCode]
    ).map(normalizeAlertPriorityCode);
    where.alarmEvents = { some: { priorityCode: { in: codes } } };
  }

  if (query.traceId) {
    where.trackingIds = { array_contains: [{ traceId: query.traceId }] };
  }

  if (query.linkType) {
    const linkTypes = asArray(query.linkType)
      .map((type) => type.trim())
      .filter(Boolean);

    if (linkTypes.length > 0) {
      addAndCondition(where, {
        OR: linkTypes.map((type) => ({
          links: { array_contains: [{ type }] },
        })),
      });
    }
  }

  if (query.search) {
    const search = query.search.trim();
    addAndCondition(where, {
      OR: [
        { errorDetails: { contains: query.search, mode: "insensitive" } },
        { conclusionNotes: { contains: query.search, mode: "insensitive" } },
        ...(search ? [{ trackingIds: { array_contains: [{ traceId: search }] } }] : []),
      ],
    });
  }

  return where;
}

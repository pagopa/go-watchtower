import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema };

// ============================================================================
// Alarm Detail — Params & Query
// ============================================================================

export const AlarmDetailParamsSchema = Type.Object({
  productId: Type.String({ format: "uuid" }),
  alarmId: Type.String({ format: "uuid" }),
});

export type AlarmDetailParams = Static<typeof AlarmDetailParamsSchema>;

export const AlarmDetailQuerySchema = Type.Object({
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
});

export type AlarmDetailQuery = Static<typeof AlarmDetailQuerySchema>;

// ============================================================================
// Alarm Detail — Response
// ============================================================================

const AlarmInfoSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  productId: Type.String(),
  productName: Type.String(),
  runbook: Type.Union([
    Type.Object({
      id: Type.String(),
      name: Type.String(),
      link: Type.String(),
      status: Type.String(),
    }),
    Type.Null(),
  ]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

const AlarmKpiSchema = Type.Object({
  totalAnalyses: Type.Integer(),
  totalOccurrences: Type.Integer(),
  avgMttaMs: Type.Union([Type.Number(), Type.Null()]),
  avgMttrMs: Type.Union([Type.Number(), Type.Null()]),
  ignorableRatio: Type.Number(),
});

const OccurrenceTrendItemSchema = Type.Object({
  date: Type.String(),
  count: Type.Integer(),
  occurrences: Type.Integer(),
});

const MttaTrendItemSchema = Type.Object({
  date: Type.String(),
  avgMttaMs: Type.Union([Type.Number(), Type.Null()]),
  avgMttrMs: Type.Union([Type.Number(), Type.Null()]),
  eventCount: Type.Integer(),
});

const EnvironmentBreakdownItemSchema = Type.Object({
  environmentId: Type.String(),
  environmentName: Type.String(),
  analysisCount: Type.Integer(),
  occurrences: Type.Integer(),
});

const OperatorBreakdownItemSchema = Type.Object({
  operatorId: Type.String(),
  operatorName: Type.String(),
  analysisCount: Type.Integer(),
  occurrences: Type.Integer(),
});

const RecentAnalysisItemSchema = Type.Object({
  id: Type.String(),
  analysisDate: Type.String(),
  status: Type.String(),
  analysisType: Type.String(),
  operatorName: Type.String(),
  environmentName: Type.String(),
  occurrences: Type.Integer(),
  conclusionNotes: Type.Union([Type.String(), Type.Null()]),
});

const TopResourceItemSchema = Type.Object({
  resourceId: Type.String(),
  resourceName: Type.String(),
  count: Type.Integer(),
});

const TopDownstreamItemSchema = Type.Object({
  downstreamId: Type.String(),
  downstreamName: Type.String(),
  count: Type.Integer(),
});

const IgnoredAlarmItemSchema = Type.Object({
  id: Type.String(),
  environmentId: Type.String(),
  environmentName: Type.String(),
  isActive: Type.Boolean(),
  reason: Type.Union([Type.String(), Type.Null()]),
});

export const AlarmDetailResponseSchema = Type.Object({
  alarm: AlarmInfoSchema,
  kpi: AlarmKpiSchema,
  occurrenceTrend: Type.Array(OccurrenceTrendItemSchema),
  mttaTrend: Type.Array(MttaTrendItemSchema),
  byEnvironment: Type.Array(EnvironmentBreakdownItemSchema),
  byOperator: Type.Array(OperatorBreakdownItemSchema),
  recentAnalyses: Type.Array(RecentAnalysisItemSchema),
  topResources: Type.Array(TopResourceItemSchema),
  topDownstreams: Type.Array(TopDownstreamItemSchema),
  ignoredAlarms: Type.Array(IgnoredAlarmItemSchema),
});

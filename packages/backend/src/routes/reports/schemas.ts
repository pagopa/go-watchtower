import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema, DateRangeFilterSchema } from "../../schemas/common.js";

export { ErrorResponseSchema };

// ============================================================================
// Query Schema (shared filters, same as stats endpoint)
// ============================================================================

export const ReportQuerySchema = DateRangeFilterSchema;

export type ReportQuery = Static<typeof ReportQuerySchema>;

// ============================================================================
// Operator Workload Response
// ============================================================================

const EnvironmentBreakdownSchema = Type.Object({
  environmentId: Type.String(),
  environmentName: Type.String(),
  count: Type.Integer(),
  onCallCount: Type.Integer(),
  occurrences: Type.Integer(),
  mttaMs: Type.Union([Type.Number(), Type.Null()]),
});

const OperatorWorkloadItemSchema = Type.Object({
  operatorId: Type.String(),
  operatorName: Type.String(),
  operatorEmail: Type.String(),
  totalAnalyses: Type.Integer(),
  onCallAnalyses: Type.Integer(),
  totalOccurrences: Type.Integer(),
  mttaMs: Type.Union([Type.Number(), Type.Null()]),
  byEnvironment: Type.Array(EnvironmentBreakdownSchema),
});

export const OperatorWorkloadResponseSchema = Type.Array(OperatorWorkloadItemSchema);

// ============================================================================
// Alarm Ranking Response
// ============================================================================

const AlarmRankingItemSchema = Type.Object({
  alarmId: Type.String(),
  alarmName: Type.String(),
  productId: Type.String(),
  productName: Type.String(),
  totalAnalyses: Type.Integer(),
  totalOccurrences: Type.Integer(),
});

export const AlarmRankingResponseSchema = Type.Array(AlarmRankingItemSchema);

// ============================================================================
// Monthly KPI Query & Response
// ============================================================================

export const MonthlyKpiQuerySchema = Type.Object({
  productId: Type.String(),
  year: Type.Integer({ minimum: 2020, maximum: 2100 }),
  month: Type.Integer({ minimum: 1, maximum: 12 }),
});

export type MonthlyKpiQuery = Static<typeof MonthlyKpiQuerySchema>;

/** Day number (1-31) → count */
const DayCountsSchema = Type.Record(Type.String(), Type.Integer());

const MonthlyKpiEnvironmentSchema = Type.Object({
  environmentId: Type.String(),
  environmentName: Type.String(),
  alarmEvents: DayCountsSchema,
  completedAnalyses: DayCountsSchema,
  ignoredAnalyses: DayCountsSchema,
});

export const MonthlyKpiResponseSchema = Type.Object({
  year: Type.Integer(),
  month: Type.Integer(),
  daysInMonth: Type.Integer(),
  environments: Type.Array(MonthlyKpiEnvironmentSchema),
});


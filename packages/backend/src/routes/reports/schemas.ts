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


import { Type, type Static } from "@sinclair/typebox";

// ============================================================================
// Enum Schemas
// ============================================================================

export const AnalysisTypeSchema = Type.Union([
  Type.Literal("ANALYZABLE"),
  Type.Literal("IGNORED_RELEASE"),
  Type.Literal("IGNORED_MAINTENANCE"),
  Type.Literal("IGNORED_LISTED"),
  Type.Literal("IGNORED_NOT_MANAGED"),
]);

export type AnalysisTypeValue = Static<typeof AnalysisTypeSchema>;

export const AnalysisStatusSchema = Type.Union([
  Type.Literal("CREATED"),
  Type.Literal("IN_PROGRESS"),
  Type.Literal("COMPLETED"),
]);

export type AnalysisStatusValue = Static<typeof AnalysisStatusSchema>;

// ============================================================================
// Param Schemas
// ============================================================================

export const ProductIdParamsSchema = Type.Object({
  productId: Type.String(),
});

export type ProductIdParams = Static<typeof ProductIdParamsSchema>;

export const AlarmAnalysisParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type AlarmAnalysisParams = Static<typeof AlarmAnalysisParamsSchema>;

// ============================================================================
// Query Schema
// ============================================================================

export const AllAnalysesQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal("analysisDate"),
      Type.Literal("firstAlarmAt"),
      Type.Literal("lastAlarmAt"),
      Type.Literal("occurrences"),
      Type.Literal("createdAt"),
      Type.Literal("updatedAt"),
    ])
  ),
  sortOrder: Type.Optional(
    Type.Union([Type.Literal("asc"), Type.Literal("desc")])
  ),
  search: Type.Optional(Type.String()),
  analysisType: Type.Optional(AnalysisTypeSchema),
  status: Type.Optional(AnalysisStatusSchema),
  isOnCall: Type.Optional(Type.Boolean()),
  operatorId: Type.Optional(Type.String()),
  environmentId: Type.Optional(Type.String()),
  alarmId: Type.Optional(Type.String()),
  finalActionId: Type.Optional(Type.String()),
  productId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
});

export type AllAnalysesQuery = Static<typeof AllAnalysesQuerySchema>;

export const AlarmAnalysisQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal("analysisDate"),
      Type.Literal("firstAlarmAt"),
      Type.Literal("lastAlarmAt"),
      Type.Literal("occurrences"),
      Type.Literal("createdAt"),
      Type.Literal("updatedAt"),
    ])
  ),
  sortOrder: Type.Optional(
    Type.Union([Type.Literal("asc"), Type.Literal("desc")])
  ),
  search: Type.Optional(Type.String()),
  analysisType: Type.Optional(AnalysisTypeSchema),
  status: Type.Optional(AnalysisStatusSchema),
  isOnCall: Type.Optional(Type.Boolean()),
  operatorId: Type.Optional(Type.String()),
  environmentId: Type.Optional(Type.String()),
  alarmId: Type.Optional(Type.String()),
  finalActionId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
});

export type AlarmAnalysisQuery = Static<typeof AlarmAnalysisQuerySchema>;

// ============================================================================
// Link Schema
// ============================================================================

export const LinkSchema = Type.Object({
  url: Type.String({ format: "uri" }),
  name: Type.Optional(Type.String()),
  type: Type.Optional(Type.String()),
});

// ============================================================================
// Tracking Entry Schema
// ============================================================================

export const TrackingEntrySchema = Type.Object({
  traceId: Type.String(),
  errorCode: Type.Optional(Type.String()),
  errorDetail: Type.Optional(Type.String()),
  timestamp: Type.Optional(Type.String()),
});

// ============================================================================
// Body Schemas
// ============================================================================

export const CreateAlarmAnalysisBodySchema = Type.Object({
  analysisDate: Type.String({ format: "date-time" }),
  firstAlarmAt: Type.String({ format: "date-time" }),
  lastAlarmAt: Type.String({ format: "date-time" }),
  occurrences: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  isOnCall: Type.Optional(Type.Boolean()),
  analysisType: Type.Optional(AnalysisTypeSchema),
  status: Type.Optional(AnalysisStatusSchema),
  alarmId: Type.String(),
  errorDetails: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  conclusionNotes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  externalTeamName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  operatorId: Type.String(),
  environmentId: Type.String(),
  finalActionIds: Type.Optional(Type.Array(Type.String())),
  runbookId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  microserviceIds: Type.Optional(Type.Array(Type.String())),
  downstreamIds: Type.Optional(Type.Array(Type.String())),
  links: Type.Optional(Type.Array(LinkSchema)),
  trackingIds: Type.Optional(Type.Array(TrackingEntrySchema)),
});

export type CreateAlarmAnalysisBody = Static<typeof CreateAlarmAnalysisBodySchema>;

export const UpdateAlarmAnalysisBodySchema = Type.Object({
  analysisDate: Type.Optional(Type.String({ format: "date-time" })),
  firstAlarmAt: Type.Optional(Type.String({ format: "date-time" })),
  lastAlarmAt: Type.Optional(Type.String({ format: "date-time" })),
  occurrences: Type.Optional(Type.Integer({ minimum: 1 })),
  isOnCall: Type.Optional(Type.Boolean()),
  analysisType: Type.Optional(AnalysisTypeSchema),
  status: Type.Optional(AnalysisStatusSchema),
  alarmId: Type.Optional(Type.String()),
  errorDetails: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  conclusionNotes: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  externalTeamName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  operatorId: Type.Optional(Type.String()),
  environmentId: Type.Optional(Type.String()),
  finalActionIds: Type.Optional(Type.Array(Type.String())),
  runbookId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  microserviceIds: Type.Optional(Type.Array(Type.String())),
  downstreamIds: Type.Optional(Type.Array(Type.String())),
  links: Type.Optional(Type.Array(LinkSchema)),
  trackingIds: Type.Optional(Type.Array(TrackingEntrySchema)),
});

export type UpdateAlarmAnalysisBody = Static<typeof UpdateAlarmAnalysisBodySchema>;

// ============================================================================
// Response Schemas
// ============================================================================

const RelatedUserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

const RelatedEntitySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
});

const RunbookResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  link: Type.Optional(Type.String()),
});

export const AlarmAnalysisResponseSchema = Type.Object({
  id: Type.String(),
  analysisDate: Type.String(),
  firstAlarmAt: Type.String(),
  lastAlarmAt: Type.String(),
  occurrences: Type.Integer(),
  isOnCall: Type.Boolean(),
  analysisType: AnalysisTypeSchema,
  status: AnalysisStatusSchema,
  alarmId: Type.String(),
  errorDetails: Type.Union([Type.String(), Type.Null()]),
  conclusionNotes: Type.Union([Type.String(), Type.Null()]),
  externalTeamName: Type.Union([Type.String(), Type.Null()]),
  operatorId: Type.String(),
  productId: Type.String(),
  environmentId: Type.String(),
  runbookId: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  createdById: Type.String(),
  updatedById: Type.Union([Type.String(), Type.Null()]),
  product: RelatedEntitySchema,
  alarm: RelatedEntitySchema,
  operator: RelatedUserSchema,
  environment: RelatedEntitySchema,
  finalActions: Type.Array(RelatedEntitySchema),
  runbook: Type.Union([RunbookResponseSchema, Type.Null()]),
  createdBy: RelatedUserSchema,
  updatedBy: Type.Union([RelatedUserSchema, Type.Null()]),
  microservices: Type.Array(RelatedEntitySchema),
  downstreams: Type.Array(RelatedEntitySchema),
  links: Type.Array(LinkSchema),
  trackingIds: Type.Array(TrackingEntrySchema),
});

export const PaginatedAlarmAnalysisResponseSchema = Type.Object({
  data: Type.Array(AlarmAnalysisResponseSchema),
  pagination: Type.Object({
    page: Type.Integer(),
    pageSize: Type.Integer(),
    totalItems: Type.Integer(),
    totalPages: Type.Integer(),
    hasNextPage: Type.Boolean(),
    hasPreviousPage: Type.Boolean(),
  }),
});

// ============================================================================
// Common Schemas
// ============================================================================

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
});

export const MessageResponseSchema = Type.Object({
  message: Type.String(),
});

// ============================================================================
// Analysis Stats Schemas
// ============================================================================

export const AnalysisStatsQuerySchema = Type.Object({
  productId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
});

export type AnalysisStatsQuery = Static<typeof AnalysisStatsQuerySchema>;

const CountByProductEnvironmentSchema = Type.Object({
  productId: Type.String(),
  productName: Type.String(),
  environmentId: Type.String(),
  environmentName: Type.String(),
  count: Type.Integer(),
});

const CountByOperatorSchema = Type.Object({
  operatorId: Type.String(),
  operatorName: Type.String(),
  count: Type.Integer(),
});

const DailyByEnvironmentSchema = Type.Object({
  date: Type.String(),
  environmentId: Type.String(),
  environmentName: Type.String(),
  count: Type.Integer(),
  totalOccurrences: Type.Integer(),
});

const CountByAnalysisTypeSchema = Type.Object({
  analysisType: AnalysisTypeSchema,
  count: Type.Integer(),
});

const TopAlarmSchema = Type.Object({
  alarmId: Type.String(),
  alarmName: Type.String(),
  count: Type.Integer(),
});

const OnCallTrendSchema = Type.Object({
  month: Type.String(),
  onCall: Type.Integer(),
  normal: Type.Integer(),
});

const KpiTopItemSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  count: Type.Integer(),
});

const KpiStatsSchema = Type.Object({
  totalAnalyses: Type.Integer(),
  totalAnalysesPrevious: Type.Integer(),
  totalOccurrences: Type.Integer(),
  totalOccurrencesPrevious: Type.Integer(),
  topFinalAction: Type.Union([KpiTopItemSchema, Type.Null()]),
  topOperator: Type.Union([KpiTopItemSchema, Type.Null()]),
});

export const AnalysisStatsResponseSchema = Type.Object({
  kpi: KpiStatsSchema,
  byProductEnvironment: Type.Array(CountByProductEnvironmentSchema),
  byOperator: Type.Array(CountByOperatorSchema),
  dailyByEnvironment: Type.Array(DailyByEnvironmentSchema),
  byAnalysisType: Type.Array(CountByAnalysisTypeSchema),
  topAlarms: Type.Array(TopAlarmSchema),
  onCallTrend: Type.Array(OnCallTrendSchema),
});

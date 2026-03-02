import { Type, type Static } from "@sinclair/typebox";
import {
  AnalysisTypes,
  AnalysisStatuses,
  AnalysisSortFields,
  SortDirections,
  RunbookStatuses,
} from "@go-watchtower/shared";
import { ErrorResponseSchema, MessageResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

// ============================================================================
// Enum Schemas
// I valori provengono da shared ma le literal devono essere esplicite per
// preservare l'inferenza statica di TypeBox (Static<typeof schema>).
// ============================================================================

export const AnalysisTypeSchema = Type.Union([
  Type.Literal(AnalysisTypes.ANALYZABLE),
  Type.Literal(AnalysisTypes.IGNORABLE),
]);

export const IgnoreReasonSchema = Type.Object({
  code:          Type.String(),
  label:         Type.String(),
  description:   Type.Union([Type.String(), Type.Null()]),
  sortOrder:     Type.Integer(),
  detailsSchema: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
});

export type AnalysisTypeValue = Static<typeof AnalysisTypeSchema>;

export const AnalysisStatusSchema = Type.Union([
  Type.Literal(AnalysisStatuses.CREATED),
  Type.Literal(AnalysisStatuses.IN_PROGRESS),
  Type.Literal(AnalysisStatuses.COMPLETED),
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
  sortBy: Type.Optional(Type.Union([
    Type.Literal(AnalysisSortFields.ANALYSIS_DATE),
    Type.Literal(AnalysisSortFields.FIRST_ALARM_AT),
    Type.Literal(AnalysisSortFields.LAST_ALARM_AT),
    Type.Literal(AnalysisSortFields.OCCURRENCES),
    Type.Literal(AnalysisSortFields.CREATED_AT),
    Type.Literal(AnalysisSortFields.UPDATED_AT),
  ])),
  sortOrder: Type.Optional(Type.Union([
    Type.Literal(SortDirections.ASC),
    Type.Literal(SortDirections.DESC),
  ])),
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
  // Advanced filters
  ignoreReasonCode: Type.Optional(Type.String()),
  runbookId: Type.Optional(Type.String()),
  microserviceId: Type.Optional(Type.String()),
  downstreamId: Type.Optional(Type.String()),
  traceId: Type.Optional(Type.String()),
});

export type AllAnalysesQuery = Static<typeof AllAnalysesQuerySchema>;

export const AlarmAnalysisQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 20 })),
  sortBy: Type.Optional(Type.Union([
    Type.Literal(AnalysisSortFields.ANALYSIS_DATE),
    Type.Literal(AnalysisSortFields.FIRST_ALARM_AT),
    Type.Literal(AnalysisSortFields.LAST_ALARM_AT),
    Type.Literal(AnalysisSortFields.OCCURRENCES),
    Type.Literal(AnalysisSortFields.CREATED_AT),
    Type.Literal(AnalysisSortFields.UPDATED_AT),
  ])),
  sortOrder: Type.Optional(Type.Union([
    Type.Literal(SortDirections.ASC),
    Type.Literal(SortDirections.DESC),
  ])),
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
  // Advanced filters
  ignoreReasonCode: Type.Optional(Type.String()),
  runbookId: Type.Optional(Type.String()),
  microserviceId: Type.Optional(Type.String()),
  downstreamId: Type.Optional(Type.String()),
  traceId: Type.Optional(Type.String()),
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
  ignoreReasonCode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  ignoreDetails: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
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
  ignoreReasonCode: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  ignoreDetails: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
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

const RunbookStatusSchema = Type.Union([
  Type.Literal(RunbookStatuses.DRAFT),
  Type.Literal(RunbookStatuses.COMPLETE),
]);

const RunbookResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  link: Type.Optional(Type.String()),
  status: RunbookStatusSchema,
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
  ignoreReasonCode: Type.Union([Type.String(), Type.Null()]),
  ignoreDetails: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
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
  ignoreReason: Type.Union([IgnoreReasonSchema, Type.Null()]),
  links: Type.Array(LinkSchema),
  trackingIds: Type.Array(TrackingEntrySchema),
  validationScore: Type.Union([Type.Integer(), Type.Null()]),
  qualityScore:    Type.Union([Type.Integer(), Type.Null()]),
  scoredAt:        Type.Union([Type.String(), Type.Null()]),
});

export const IgnoreReasonsResponseSchema = Type.Array(IgnoreReasonSchema);

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
// Analysis Authors Schema
// ============================================================================

export const AnalysisAuthorSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
});

export const AnalysisAuthorsResponseSchema = Type.Array(AnalysisAuthorSchema);

export type AnalysisAuthor = Static<typeof AnalysisAuthorSchema>;

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

export const CountByAnalysisTypeSchema = Type.Object({
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

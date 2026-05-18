import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema, MessageResponseSchema, RelatedEntitySchema } from "../../schemas/common.js";

// Alarm reference embedded in AlarmEvent — richer than RelatedEntity (includes description + runbook)
const EmbeddedAlarmSchema = Type.Object({
  id:          Type.String(),
  name:        Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  runbook:     Type.Union([
    Type.Object({
      id:   Type.String(),
      name: Type.String(),
      link: Type.String(),
    }),
    Type.Null(),
  ]),
});

export { ErrorResponseSchema, MessageResponseSchema };

// ─── Response ─────────────────────────────────────────────────────────────────

const AlarmEventPrioritySchema = Type.Object({
  code:           Type.String(),
  label:          Type.String(),
  rank:           Type.Integer(),
  color:          Type.Union([Type.String(), Type.Null()]),
  icon:           Type.Union([Type.String(), Type.Null()]),
  countsAsOnCall: Type.Boolean(),
  isDefault:      Type.Boolean(),
  ruleId:         Type.Union([Type.String(), Type.Null()]),
  ruleName:       Type.Union([Type.String(), Type.Null()]),
  resolvedAt:     Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
});

export const AlarmEventResponseSchema = Type.Object({
  id:            Type.String(),
  name:          Type.String(),
  firedAt:       Type.String({ format: "date-time" }),
  description:   Type.Union([Type.String(), Type.Null()]),
  reason:        Type.Union([Type.String(), Type.Null()]),
  awsRegion:     Type.String(),
  awsAccountId:  Type.String(),
  product:       RelatedEntitySchema,
  environment:   RelatedEntitySchema,
  alarmId:       Type.Union([Type.String(), Type.Null()]),
  alarm:         Type.Union([EmbeddedAlarmSchema, Type.Null()]),
  priority:      AlarmEventPrioritySchema,
  analysisId:    Type.Union([Type.String(), Type.Null()]),
  linkedAt:      Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  resolvedAt:    Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  createdAt:     Type.String({ format: "date-time" }),
});

export const PaginatedAlarmEventsResponseSchema = Type.Object({
  data: Type.Array(AlarmEventResponseSchema),
  pagination: Type.Object({
    page:       Type.Integer(),
    pageSize:   Type.Integer(),
    totalItems: Type.Integer(),
    totalPages: Type.Integer(),
  }),
});

export type AlarmEventResponse = Static<typeof AlarmEventResponseSchema>;

// ─── Params ───────────────────────────────────────────────────────────────────

export const AlarmEventParamsSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
});

export type AlarmEventParams = Static<typeof AlarmEventParamsSchema>;

// ─── Query ────────────────────────────────────────────────────────────────────

export const AlarmEventsQuerySchema = Type.Object({
  productId:     Type.Optional(Type.String()),
  environmentId: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  alarmId:       Type.Optional(Type.String()),
  analysisId:    Type.Optional(Type.String()),
  awsAccountId:  Type.Optional(Type.String()),
  awsRegion:     Type.Optional(Type.String()),
  priorityCode:  Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  dateFrom:      Type.Optional(Type.String({ format: "date-time" })),
  dateTo:        Type.Optional(Type.String({ format: "date-time" })),
  createdFrom:   Type.Optional(Type.String({ format: "date-time" })),
  hasAnalysis:   Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
  name:          Type.Optional(Type.String()),
  sortBy:        Type.Optional(Type.Union([Type.Literal('firedAt'), Type.Literal('createdAt')])),
  page:          Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize:      Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 20 })),
});

export type AlarmEventsQuery = Static<typeof AlarmEventsQuerySchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateAlarmEventBodySchema = Type.Object({
  name:          Type.String({ minLength: 1, maxLength: 500 }),
  firedAt:       Type.String({ format: "date-time" }),
  productId:     Type.String({ format: "uuid" }),
  environmentId: Type.String({ format: "uuid" }),
  awsRegion:     Type.String({ minLength: 1, maxLength: 100 }),
  awsAccountId:  Type.String({ minLength: 1, maxLength: 100 }),
  description:   Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
  reason:        Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
});

export type CreateAlarmEventBody = Static<typeof CreateAlarmEventBodySchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

// firedAt, name, awsRegion, awsAccountId sono immutabili (dati originali AWS)
export const UpdateAlarmEventBodySchema = Type.Object({
  description: Type.Optional(Type.Union([Type.String({ maxLength: 5000 }), Type.Null()])),
  reason:      Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  alarmId:     Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  analysisId:  Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  linkedAt:    Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  resolvedAt:  Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
});

export type UpdateAlarmEventBody = Static<typeof UpdateAlarmEventBodySchema>;

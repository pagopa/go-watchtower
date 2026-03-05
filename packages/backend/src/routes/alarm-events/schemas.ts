import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema, MessageResponseSchema, RelatedEntitySchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

// ─── Response ─────────────────────────────────────────────────────────────────

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
  id: Type.String(),
});

export type AlarmEventParams = Static<typeof AlarmEventParamsSchema>;

// ─── Query ────────────────────────────────────────────────────────────────────

export const AlarmEventsQuerySchema = Type.Object({
  productId:     Type.Optional(Type.String()),
  environmentId: Type.Optional(Type.String()),
  awsAccountId:  Type.Optional(Type.String()),
  awsRegion:     Type.Optional(Type.String()),
  dateFrom:      Type.Optional(Type.String({ format: "date-time" })),
  dateTo:        Type.Optional(Type.String({ format: "date-time" })),
  page:          Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize:      Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 20 })),
});

export type AlarmEventsQuery = Static<typeof AlarmEventsQuerySchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateAlarmEventBodySchema = Type.Object({
  name:          Type.String({ minLength: 1 }),
  firedAt:       Type.String({ format: "date-time" }),
  productId:     Type.String({ minLength: 1 }),
  environmentId: Type.String({ minLength: 1 }),
  awsRegion:     Type.String({ minLength: 1 }),
  awsAccountId:  Type.String({ minLength: 1 }),
  description:   Type.Optional(Type.Union([Type.String(), Type.Null()])),
  reason:        Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type CreateAlarmEventBody = Static<typeof CreateAlarmEventBodySchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

// firedAt, name, awsRegion, awsAccountId sono immutabili (dati originali AWS)
export const UpdateAlarmEventBodySchema = Type.Object({
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  reason:      Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type UpdateAlarmEventBody = Static<typeof UpdateAlarmEventBodySchema>;

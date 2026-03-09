import { Type, type Static } from "@sinclair/typebox";
import {
  ErrorResponseSchema,
  MessageResponseSchema,
  ProductIdParamsSchema,
  RelatedEntitySchema,
  RunbookStatusSchema,
} from "../../schemas/common.js";

export {
  ErrorResponseSchema,
  MessageResponseSchema,
  ProductIdParamsSchema,
  RunbookStatusSchema,
};

// ============================================================================
// Product Schemas
// ============================================================================

export const CreateProductBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  isActive: Type.Optional(Type.Boolean()),
});

export type CreateProductBody = Static<typeof CreateProductBodySchema>;

export const UpdateProductBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  isActive: Type.Optional(Type.Boolean()),
});

export type UpdateProductBody = Static<typeof UpdateProductBodySchema>;

export const ProductParamsSchema = Type.Object({
  id: Type.String(),
});

export type ProductParams = Static<typeof ProductParamsSchema>;

export const ProductResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  isActive: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const ProductsResponseSchema = Type.Array(ProductResponseSchema);

// ============================================================================
// Environment Schemas
// ============================================================================

export const CreateEnvironmentBodySchema = Type.Object({
  name:                Type.String({ minLength: 1, maxLength: 255 }),
  description:         Type.Optional(Type.String()),
  order:               Type.Optional(Type.Number({ minimum: 0 })),
  slackChannelId:      Type.Optional(Type.String()),
  defaultAwsAccountId: Type.Optional(Type.String()),
  defaultAwsRegion:    Type.Optional(Type.String()),
  onCallAlarmPattern:  Type.Optional(Type.String()),
});

export type CreateEnvironmentBody = Static<typeof CreateEnvironmentBodySchema>;

export const UpdateEnvironmentBodySchema = Type.Object({
  name:                Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description:         Type.Optional(Type.Union([Type.String(), Type.Null()])),
  order:               Type.Optional(Type.Number({ minimum: 0 })),
  slackChannelId:      Type.Optional(Type.Union([Type.String(), Type.Null()])),
  defaultAwsAccountId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  defaultAwsRegion:    Type.Optional(Type.Union([Type.String(), Type.Null()])),
  onCallAlarmPattern:  Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type UpdateEnvironmentBody = Static<typeof UpdateEnvironmentBodySchema>;

export const EnvironmentParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type EnvironmentParams = Static<typeof EnvironmentParamsSchema>;

export type ProductIdParams = Static<typeof ProductIdParamsSchema>;

export const EnvironmentResponseSchema = Type.Object({
  id:                  Type.String(),
  name:                Type.String(),
  description:         Type.Union([Type.String(), Type.Null()]),
  order:               Type.Number(),
  productId:           Type.String(),
  slackChannelId:      Type.Union([Type.String(), Type.Null()]),
  defaultAwsAccountId: Type.Union([Type.String(), Type.Null()]),
  defaultAwsRegion:    Type.Union([Type.String(), Type.Null()]),
  onCallAlarmPattern:  Type.Union([Type.String(), Type.Null()]),
  createdAt:           Type.String(),
  updatedAt:           Type.String(),
});

export const EnvironmentsResponseSchema = Type.Array(EnvironmentResponseSchema);

// ============================================================================
// Resource Schemas
// ============================================================================

export const CreateResourceBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  typeId: Type.String({ format: "uuid" }),
});

export type CreateResourceBody = Static<typeof CreateResourceBodySchema>;

export const UpdateResourceBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  typeId: Type.Optional(Type.String({ format: "uuid" })),
});

export type UpdateResourceBody = Static<typeof UpdateResourceBodySchema>;

export const ResourceParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type ResourceParams = Static<typeof ResourceParamsSchema>;

export const ResourceResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  typeId: Type.String(),
  type: Type.Object({
    id: Type.String(),
    name: Type.String(),
  }),
  productId: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const ResourcesResponseSchema = Type.Array(ResourceResponseSchema);

// ============================================================================
// Runbook Schemas
// ============================================================================

export const CreateRunbookBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  link: Type.String({ minLength: 1, pattern: "^https?://" }),
  status: Type.Optional(RunbookStatusSchema),
});

export type CreateRunbookBody = Static<typeof CreateRunbookBodySchema>;

export const UpdateRunbookBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  link: Type.Optional(Type.String({ minLength: 1, pattern: "^https?://" })),
  status: Type.Optional(RunbookStatusSchema),
});

export type UpdateRunbookBody = Static<typeof UpdateRunbookBodySchema>;

export const RunbookParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type RunbookParams = Static<typeof RunbookParamsSchema>;

export const RunbookResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  link: Type.String(),
  status: RunbookStatusSchema,
  productId: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const RunbooksResponseSchema = Type.Array(RunbookResponseSchema);

// ============================================================================
// Final Action Schemas
// ============================================================================

export const CreateFinalActionBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  order: Type.Optional(Type.Number({ minimum: 0 })),
  isOther: Type.Optional(Type.Boolean()),
});

export type CreateFinalActionBody = Static<typeof CreateFinalActionBodySchema>;

export const UpdateFinalActionBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  order: Type.Optional(Type.Number({ minimum: 0 })),
  isOther: Type.Optional(Type.Boolean()),
});

export type UpdateFinalActionBody = Static<typeof UpdateFinalActionBodySchema>;

export const FinalActionParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type FinalActionParams = Static<typeof FinalActionParamsSchema>;

export const FinalActionResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  order: Type.Number(),
  isOther: Type.Boolean(),
  productId: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const FinalActionsResponseSchema = Type.Array(FinalActionResponseSchema);

// ============================================================================
// Alarm Schemas
// ============================================================================

export const CreateAlarmBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  runbookId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type CreateAlarmBody = Static<typeof CreateAlarmBodySchema>;

export const UpdateAlarmBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  runbookId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type UpdateAlarmBody = Static<typeof UpdateAlarmBodySchema>;

export const AlarmParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type AlarmParams = Static<typeof AlarmParamsSchema>;

export const AlarmResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  runbookId: Type.Union([Type.String(), Type.Null()]),
  runbook: Type.Union([
    Type.Object({
      id: Type.String(),
      name: Type.String(),
    }),
    Type.Null(),
  ]),
  productId: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const AlarmsResponseSchema = Type.Array(AlarmResponseSchema);

// ============================================================================
// Downstream Schemas
// ============================================================================

export const CreateDownstreamBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
});

export type CreateDownstreamBody = Static<typeof CreateDownstreamBodySchema>;

export const UpdateDownstreamBodySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

export type UpdateDownstreamBody = Static<typeof UpdateDownstreamBodySchema>;

export const DownstreamParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type DownstreamParams = Static<typeof DownstreamParamsSchema>;

export const DownstreamResponseSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  productId: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const DownstreamsResponseSchema = Type.Array(DownstreamResponseSchema);

// ============================================================================
// Ignored Alarm Schemas
// ============================================================================

const TimeConstraintPeriodSchema = Type.Object({
  start: Type.String({ format: "date-time" }),
  end: Type.String({ format: "date-time" }),
});

const TimeConstraintHoursSchema = Type.Object({
  start: Type.String({ pattern: "^\\d{2}:\\d{2}$" }),
  end: Type.String({ pattern: "^\\d{2}:\\d{2}$" }),
});

const TimeConstraintSchema = Type.Object({
  periods: Type.Optional(Type.Array(TimeConstraintPeriodSchema)),
  weekdays: Type.Optional(Type.Array(Type.Integer({ minimum: 0, maximum: 6 }))),
  hours: Type.Optional(Type.Array(TimeConstraintHoursSchema)),
});

export const CreateIgnoredAlarmBodySchema = Type.Object({
  alarmId: Type.String(),
  environmentId: Type.String(),
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  isActive: Type.Optional(Type.Boolean()),
  validity: Type.Optional(Type.Array(TimeConstraintSchema)),
  exclusions: Type.Optional(Type.Array(TimeConstraintSchema)),
});

export type CreateIgnoredAlarmBody = Static<typeof CreateIgnoredAlarmBodySchema>;

export const UpdateIgnoredAlarmBodySchema = Type.Object({
  alarmId: Type.Optional(Type.String()),
  environmentId: Type.Optional(Type.String()),
  reason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  isActive: Type.Optional(Type.Boolean()),
  validity: Type.Optional(Type.Array(TimeConstraintSchema)),
  exclusions: Type.Optional(Type.Array(TimeConstraintSchema)),
});

export type UpdateIgnoredAlarmBody = Static<typeof UpdateIgnoredAlarmBodySchema>;

export const IgnoredAlarmParamsSchema = Type.Object({
  productId: Type.String(),
  id: Type.String(),
});

export type IgnoredAlarmParams = Static<typeof IgnoredAlarmParamsSchema>;

export const IgnoredAlarmResponseSchema = Type.Object({
  id: Type.String(),
  alarmId: Type.String(),
  environmentId: Type.String(),
  reason: Type.Union([Type.String(), Type.Null()]),
  isActive: Type.Boolean(),
  productId: Type.String(),
  validity: Type.Array(TimeConstraintSchema),
  exclusions: Type.Array(TimeConstraintSchema),
  alarm: RelatedEntitySchema,
  environment: RelatedEntitySchema,
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const IgnoredAlarmsResponseSchema = Type.Array(IgnoredAlarmResponseSchema);

// ============================================================================
// Filter Options Schema (aggregate endpoint)
// ============================================================================

export const FilterOptionsResponseSchema = Type.Object({
  environments: EnvironmentsResponseSchema,
  alarms: AlarmsResponseSchema,
  finalActions: FinalActionsResponseSchema,
  resources: ResourcesResponseSchema,
  downstreams: DownstreamsResponseSchema,
  runbooks: RunbooksResponseSchema,
});

export type FilterOptionsResponse = Static<typeof FilterOptionsResponseSchema>;

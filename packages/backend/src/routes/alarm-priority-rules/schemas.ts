import { Type, type Static } from "@sinclair/typebox";
import {
  AlertPriorityCodes,
  AlarmPriorityMatcherTypes,
} from "@go-watchtower/shared";
import { ErrorResponseSchema, MessageResponseSchema, ProductIdParamsSchema, RelatedEntitySchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema, ProductIdParamsSchema };

const PriorityCodeSchema = Type.String({
  minLength: 2,
  maxLength: 64,
  pattern: "^[A-Z][A-Z0-9_]*$",
});

const MatcherTypeSchema = Type.Union([
  Type.Literal(AlarmPriorityMatcherTypes.ALARM_ID),
  Type.Literal(AlarmPriorityMatcherTypes.ALARM_NAME_PREFIX),
  Type.Literal(AlarmPriorityMatcherTypes.ALARM_NAME_REGEX),
]);

const TimeConstraintPeriodSchema = Type.Object({
  start: Type.String({ format: "date-time" }),
  end: Type.String({ format: "date-time" }),
});

const TimeConstraintHoursSchema = Type.Object({
  start: Type.String({ pattern: "^\\d{2}:\\d{2}$" }),
  end: Type.String({ pattern: "^\\d{2}:\\d{2}$" }),
});

export const TimeConstraintSchema = Type.Object({
  periods: Type.Optional(Type.Array(TimeConstraintPeriodSchema)),
  weekdays: Type.Optional(Type.Array(Type.Integer({ minimum: 0, maximum: 6 }))),
  hours: Type.Optional(Type.Array(TimeConstraintHoursSchema)),
});

const PrioritySummarySchema = Type.Object({
  code:           PriorityCodeSchema,
  label:          Type.String(),
  rank:           Type.Integer(),
  color:          Type.Union([Type.String(), Type.Null()]),
  icon:           Type.Union([Type.String(), Type.Null()]),
  countsAsOnCall: Type.Boolean(),
  isDefault:      Type.Boolean(),
});

export const AlarmPriorityRuleResponseSchema = Type.Object({
  id:            Type.String(),
  productId:     Type.String(),
  environmentId: Type.Union([Type.String(), Type.Null()]),
  priorityCode:  PriorityCodeSchema,
  name:          Type.String(),
  matcherType:   MatcherTypeSchema,
  alarmId:       Type.Union([Type.String(), Type.Null()]),
  namePrefix:    Type.Union([Type.String(), Type.Null()]),
  namePattern:   Type.Union([Type.String(), Type.Null()]),
  precedence:    Type.Integer(),
  note:          Type.Union([Type.String(), Type.Null()]),
  isActive:      Type.Boolean(),
  validity:      Type.Array(TimeConstraintSchema),
  exclusions:    Type.Array(TimeConstraintSchema),
  priority:      PrioritySummarySchema,
  environment:   Type.Union([RelatedEntitySchema, Type.Null()]),
  alarm:         Type.Union([RelatedEntitySchema, Type.Null()]),
  createdAt:     Type.String(),
  updatedAt:     Type.String(),
});

export const AlarmPriorityRulesResponseSchema = Type.Array(AlarmPriorityRuleResponseSchema);

export const AlarmPriorityRuleParamsSchema = Type.Object({
  productId: Type.String({ format: "uuid" }),
  id: Type.String({ format: "uuid" }),
});

export type AlarmPriorityRuleParams = Static<typeof AlarmPriorityRuleParamsSchema>;

export const CreateAlarmPriorityRuleBodySchema = Type.Object({
  environmentId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  priorityCode:  PriorityCodeSchema,
  name:          Type.String({ minLength: 1, maxLength: 255 }),
  matcherType:   MatcherTypeSchema,
  alarmId:       Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  namePrefix:    Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  namePattern:   Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  precedence:    Type.Optional(Type.Integer()),
  note:          Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  isActive:      Type.Optional(Type.Boolean()),
  validity:      Type.Optional(Type.Array(TimeConstraintSchema)),
  exclusions:    Type.Optional(Type.Array(TimeConstraintSchema)),
});

export type CreateAlarmPriorityRuleBody = Static<typeof CreateAlarmPriorityRuleBodySchema>;

export const UpdateAlarmPriorityRuleBodySchema = Type.Object({
  environmentId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  priorityCode:  Type.Optional(PriorityCodeSchema),
  name:          Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  matcherType:   Type.Optional(MatcherTypeSchema),
  alarmId:       Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  namePrefix:    Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
  namePattern:   Type.Optional(Type.Union([Type.String({ maxLength: 1000 }), Type.Null()])),
  precedence:    Type.Optional(Type.Integer()),
  note:          Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  isActive:      Type.Optional(Type.Boolean()),
  validity:      Type.Optional(Type.Array(TimeConstraintSchema)),
  exclusions:    Type.Optional(Type.Array(TimeConstraintSchema)),
});

export type UpdateAlarmPriorityRuleBody = Static<typeof UpdateAlarmPriorityRuleBodySchema>;

export const PRIORITY_LEVEL_DEFAULT_CODE = AlertPriorityCodes.NORMAL;

import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema, MessageResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

const PriorityCodeSchema = Type.String({
  minLength: 2,
  maxLength: 64,
  pattern: "^[A-Z][A-Z0-9_]*$",
});

export const PriorityLevelResponseSchema = Type.Object({
  code:           PriorityCodeSchema,
  label:          Type.String(),
  description:    Type.Union([Type.String(), Type.Null()]),
  rank:           Type.Integer(),
  color:          Type.Union([Type.String(), Type.Null()]),
  icon:           Type.Union([Type.String(), Type.Null()]),
  isActive:       Type.Boolean(),
  isDefault:      Type.Boolean(),
  countsAsOnCall: Type.Boolean(),
  defaultNotify:  Type.Boolean(),
  isSystem:       Type.Boolean(),
  createdAt:      Type.String(),
  updatedAt:      Type.String(),
});

export const PriorityLevelsResponseSchema = Type.Array(PriorityLevelResponseSchema);

export const PriorityLevelParamsSchema = Type.Object({
  code: PriorityCodeSchema,
});

export type PriorityLevelParams = Static<typeof PriorityLevelParamsSchema>;

export const CreatePriorityLevelBodySchema = Type.Object({
  code:           PriorityCodeSchema,
  label:          Type.String({ minLength: 1, maxLength: 255 }),
  description:    Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  rank:           Type.Integer(),
  color:          Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
  icon:           Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
  isActive:       Type.Optional(Type.Boolean()),
  isDefault:      Type.Optional(Type.Boolean()),
  countsAsOnCall: Type.Optional(Type.Boolean()),
  defaultNotify:  Type.Optional(Type.Boolean()),
});

export type CreatePriorityLevelBody = Static<typeof CreatePriorityLevelBodySchema>;

export const UpdatePriorityLevelBodySchema = Type.Object({
  label:          Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description:    Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  rank:           Type.Optional(Type.Integer()),
  color:          Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
  icon:           Type.Optional(Type.Union([Type.String({ maxLength: 64 }), Type.Null()])),
  isActive:       Type.Optional(Type.Boolean()),
  isDefault:      Type.Optional(Type.Boolean()),
  countsAsOnCall: Type.Optional(Type.Boolean()),
  defaultNotify:  Type.Optional(Type.Boolean()),
});

export type UpdatePriorityLevelBody = Static<typeof UpdatePriorityLevelBodySchema>;

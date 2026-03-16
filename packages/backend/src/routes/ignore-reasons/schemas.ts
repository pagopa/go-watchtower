import { Type, type Static } from "@sinclair/typebox";
import { IGNORE_REASON_CODE_PATTERN } from "@go-watchtower/shared";
import { ErrorResponseSchema, MessageResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

// ─── Shared ────────────────────────────────────────────────────────────────

export const IgnoreReasonResponseSchema = Type.Object({
  code:          Type.String(),
  label:         Type.String(),
  description:   Type.Union([Type.String(), Type.Null()]),
  sortOrder:     Type.Integer(),
  detailsSchema: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
});

export const IgnoreReasonsResponseSchema = Type.Array(IgnoreReasonResponseSchema);

export type IgnoreReasonResponse = Static<typeof IgnoreReasonResponseSchema>;

// ─── Params ────────────────────────────────────────────────────────────────

export const IgnoreReasonParamsSchema = Type.Object({
  code: Type.String(),
});

export type IgnoreReasonParams = Static<typeof IgnoreReasonParamsSchema>;

// ─── Create ────────────────────────────────────────────────────────────────

export const CreateIgnoreReasonBodySchema = Type.Object({
  code:          Type.String({ minLength: 1, maxLength: 100, pattern: IGNORE_REASON_CODE_PATTERN }),
  label:         Type.String({ minLength: 1, maxLength: 255 }),
  description:   Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  sortOrder:     Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  detailsSchema: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
});

export type CreateIgnoreReasonBody = Static<typeof CreateIgnoreReasonBodySchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const UpdateIgnoreReasonBodySchema = Type.Object({
  label:         Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  description:   Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  sortOrder:     Type.Optional(Type.Integer({ minimum: 0 })),
  detailsSchema: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
});

export type UpdateIgnoreReasonBody = Static<typeof UpdateIgnoreReasonBodySchema>;


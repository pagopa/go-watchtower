import { Type, type Static } from "@sinclair/typebox";

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
  code:          Type.String({ minLength: 1, pattern: "^[A-Z_]+$" }),
  label:         Type.String({ minLength: 1 }),
  description:   Type.Optional(Type.Union([Type.String(), Type.Null()])),
  sortOrder:     Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  detailsSchema: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
});

export type CreateIgnoreReasonBody = Static<typeof CreateIgnoreReasonBodySchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const UpdateIgnoreReasonBodySchema = Type.Object({
  label:         Type.Optional(Type.String({ minLength: 1 })),
  description:   Type.Optional(Type.Union([Type.String(), Type.Null()])),
  sortOrder:     Type.Optional(Type.Integer({ minimum: 0 })),
  detailsSchema: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
});

export type UpdateIgnoreReasonBody = Static<typeof UpdateIgnoreReasonBodySchema>;

// ─── Common ────────────────────────────────────────────────────────────────

export const ErrorResponseSchema = Type.Object({ error: Type.String() });
export const MessageResponseSchema = Type.Object({ message: Type.String() });

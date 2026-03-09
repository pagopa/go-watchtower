import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema, MessageResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

// ─── Shared ────────────────────────────────────────────────────────────────

export const ResourceTypeResponseSchema = Type.Object({
  id:        Type.String(),
  name:      Type.String(),
  sortOrder: Type.Integer(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const ResourceTypesResponseSchema = Type.Array(ResourceTypeResponseSchema);

export type ResourceTypeResponse = Static<typeof ResourceTypeResponseSchema>;

// ─── Params ────────────────────────────────────────────────────────────────

export const ResourceTypeParamsSchema = Type.Object({
  id: Type.String(),
});

export type ResourceTypeParams = Static<typeof ResourceTypeParamsSchema>;

// ─── Create ────────────────────────────────────────────────────────────────

export const CreateResourceTypeBodySchema = Type.Object({
  name:      Type.String({ minLength: 1, maxLength: 255 }),
  sortOrder: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

export type CreateResourceTypeBody = Static<typeof CreateResourceTypeBodySchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const UpdateResourceTypeBodySchema = Type.Object({
  name:      Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
  sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
});

export type UpdateResourceTypeBody = Static<typeof UpdateResourceTypeBodySchema>;

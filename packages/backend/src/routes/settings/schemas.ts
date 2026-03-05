import { Type, type Static } from "@sinclair/typebox";
import { ErrorResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema };

export const SystemSettingSchema = Type.Object({
  id:          Type.String(),
  key:         Type.String(),
  value:       Type.Unknown(),
  type:        Type.String(),
  format:      Type.Union([Type.String(), Type.Null()]),
  category:    Type.String(),
  label:       Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  updatedById: Type.Union([Type.String(), Type.Null()]),
  createdAt:   Type.String(),
  updatedAt:   Type.String(),
});

export const SystemSettingsResponseSchema = Type.Array(SystemSettingSchema);

export const SettingKeyParamsSchema = Type.Object({
  key: Type.String(),
});

export type SettingKeyParams = Static<typeof SettingKeyParamsSchema>;

export const UpdateSettingBodySchema = Type.Object({
  value: Type.Unknown(),
});

export type UpdateSettingBody = Static<typeof UpdateSettingBodySchema>;


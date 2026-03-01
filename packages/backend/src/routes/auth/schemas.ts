import { Type, type Static } from "@sinclair/typebox";
import { ValidationConstraints } from "@go-watchtower/shared";
import { ErrorResponseSchema, MessageResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

export const RegisterBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: ValidationConstraints.PASSWORD_MIN_LENGTH_REGISTER }),
  name: Type.String({ minLength: 2 }),
});

export type RegisterBody = Static<typeof RegisterBodySchema>;

export const LoginBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 1 }),
});

export type LoginBody = Static<typeof LoginBodySchema>;

export const RefreshBodySchema = Type.Object({
  refreshToken: Type.String(),
});

export type RefreshBody = Static<typeof RefreshBodySchema>;

export const UserResponseSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  role: Type.String(),
  provider: Type.String(),
  isActive: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

export const AuthResponseSchema = Type.Object({
  user: UserResponseSchema,
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Number(),
});

export const TokenResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Number(),
});

export const MeResponseSchema = UserResponseSchema;

export const SessionSchema = Type.Object({
  id: Type.String(),
  userAgent: Type.Union([Type.String(), Type.Null()]),
  ipAddress: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
  expiresAt: Type.String(),
  current: Type.Boolean(),
});

export const SessionsResponseSchema = Type.Object({
  sessions: Type.Array(SessionSchema),
});

export const RevokeSessionParamsSchema = Type.Object({
  sessionId: Type.String(),
});

export type RevokeSessionParams = Static<typeof RevokeSessionParamsSchema>;

export const GoogleCallbackBodySchema = Type.Object({
  idToken: Type.Optional(Type.String()),
  accessToken: Type.Optional(Type.String()),
});

export type GoogleCallbackBody = Static<typeof GoogleCallbackBodySchema>;

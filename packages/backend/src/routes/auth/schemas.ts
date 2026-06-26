import { Type, type Static } from "@sinclair/typebox";
import { ValidationConstraints, PASSWORD_PATTERN } from "@go-watchtower/shared";
import { ErrorResponseSchema, MessageResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema, MessageResponseSchema };

export const RegisterBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: ValidationConstraints.PASSWORD_MIN_LENGTH_REGISTER, maxLength: 255, pattern: PASSWORD_PATTERN }),
  name: Type.String({ minLength: 2, maxLength: 255 }),
});

export type RegisterBody = Static<typeof RegisterBodySchema>;

export const LoginBodySchema = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 1, maxLength: 255 }),
});

export type LoginBody = Static<typeof LoginBodySchema>;

export const RefreshBodySchema = Type.Object({
  refreshToken: Type.String(),
});

export type RefreshBody = Static<typeof RefreshBodySchema>;

export const CliLoginBodySchema = Type.Object({
  token: Type.String({ minLength: 1, maxLength: 512 }),
});

export type CliLoginBody = Static<typeof CliLoginBodySchema>;

// Runbook Automation service principal login (D4/A2).
export const ServiceLoginBodySchema = Type.Object({
  serviceId: Type.String({ minLength: 1, maxLength: 255 }),
  password: Type.String({ minLength: 1, maxLength: 255 }),
});

export type ServiceLoginBody = Static<typeof ServiceLoginBodySchema>;

export const ServiceTokenResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Number(),
  serviceId: Type.String(),
  principalType: Type.Literal("SERVICE"),
});

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
  principalType: Type.Optional(Type.Union([Type.Literal("HUMAN"), Type.Literal("SERVICE")])),
  authMethod: Type.Optional(Type.Union([Type.Literal("CLI_PAT"), Type.Literal("SERVICE_LOGIN"), Type.Literal("HUMAN_LOGIN")])),
  scope: Type.Optional(Type.Array(Type.String())),
  cliTokenExpiresAt: Type.Optional(Type.String()),
});

export const CliTokenMetadataResponseSchema = Type.Object({
  hint: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.Union([Type.String(), Type.Null()]),
  lastUsedAt: Type.Union([Type.String(), Type.Null()]),
  expiresAt: Type.Union([Type.String(), Type.Null()]),
  defaultTtlDays: Type.Number(),
  maxTtlDays: Type.Number(),
});

export const CreateCliTokenBodySchema = Type.Object({
  expiresInDays: Type.Optional(Type.Number({ minimum: 1 })),
});

export type CreateCliTokenBody = Static<typeof CreateCliTokenBodySchema>;

export const CreateCliTokenResponseSchema = Type.Object({
  token: Type.String(),
  hint: Type.String(),
  createdAt: Type.String(),
  expiresAt: Type.String(),
  defaultTtlDays: Type.Number(),
  maxTtlDays: Type.Number(),
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
  sessionId: Type.String({ format: "uuid" }),
});

export type RevokeSessionParams = Static<typeof RevokeSessionParamsSchema>;

export const GoogleCallbackBodySchema = Type.Object({
  idToken: Type.Optional(Type.String()),
  accessToken: Type.Optional(Type.String()),
});

export type GoogleCallbackBody = Static<typeof GoogleCallbackBodySchema>;

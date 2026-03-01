import { Type } from "@sinclair/typebox";
import { PermissionScopes } from "@go-watchtower/shared";

// ─── Schemi di risposta comuni ────────────────────────────────────────────────

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
});

export const MessageResponseSchema = Type.Object({
  message: Type.String(),
});

// ─── Permission scope ─────────────────────────────────────────────────────────
// I valori provengono da shared ma le literal devono essere esplicite per
// preservare l'inferenza statica di TypeBox (Static<typeof schema>).

export const PermissionScopeSchema = Type.Union([
  Type.Literal(PermissionScopes.NONE),
  Type.Literal(PermissionScopes.OWN),
  Type.Literal(PermissionScopes.ALL),
]);

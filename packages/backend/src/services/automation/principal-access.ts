import { PrincipalTypes } from "@go-watchtower/shared";
import type { PrincipalType } from "@go-watchtower/shared";

/**
 * Decisioni pure di AuthN/AuthZ del principal (D4/A2-A3, OPUS-03 §9.6/§9.7).
 * L'autorità è il contesto riletto dal DB (non i claim JWT).
 */

export interface PrincipalContext {
  readonly principalType: PrincipalType;
  readonly serviceId: string | null;
  readonly isActive: boolean;
}

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: string; readonly reason: string };

const ALLOW: AccessDecision = { allowed: true };

/** `/auth/login` accetta solo HUMAN attivi (SERVICE → 403 PRINCIPAL_TYPE_NOT_ALLOWED). */
export function canHumanLogin(principal: PrincipalContext): boolean {
  return principal.principalType === PrincipalTypes.HUMAN && principal.isActive;
}

/** `/auth/service/login` accetta solo SERVICE attivi (HUMAN/inattivo → 401 indistinguibile). */
export function canServiceLogin(principal: PrincipalContext): boolean {
  return (
    principal.principalType === PrincipalTypes.SERVICE &&
    principal.serviceId !== null &&
    principal.isActive
  );
}

/** `requireHumanPrincipal()`: le API umane sono vietate al service principal. */
export function evaluateHumanGuard(principal: PrincipalContext): AccessDecision {
  if (!principal.isActive) {
    return { allowed: false, code: "PRINCIPAL_INACTIVE", reason: "Principal is disabled" };
  }
  if (principal.principalType !== PrincipalTypes.HUMAN) {
    return {
      allowed: false,
      code: "PRINCIPAL_TYPE_NOT_ALLOWED",
      reason: "Human principal required",
    };
  }
  return ALLOW;
}

/**
 * `requireService(serviceId)`: le callback lifecycle sono riservate al solo service
 * principal con il serviceId esatto. Un HUMAN con il permesso write NON passa.
 */
export function evaluateServiceGuard(
  principal: PrincipalContext,
  requiredServiceId: string,
): AccessDecision {
  if (!principal.isActive) {
    return { allowed: false, code: "PRINCIPAL_INACTIVE", reason: "Principal is disabled" };
  }
  if (principal.principalType !== PrincipalTypes.SERVICE) {
    return {
      allowed: false,
      code: "PRINCIPAL_TYPE_NOT_ALLOWED",
      reason: "Service principal required",
    };
  }
  if (principal.serviceId !== requiredServiceId) {
    return {
      allowed: false,
      code: "SERVICE_ID_NOT_ALLOWED",
      reason: "Service principal not authorized for this resource",
    };
  }
  return ALLOW;
}

/**
 * Verifica i claim tecnici di un access token service (aud/iss): solo i token
 * emessi da `/auth/service/login` li portano. Difesa in profondità accanto alla
 * rilettura DB.
 */
export function verifyServiceTokenClaims(
  claims: { principalType?: string; aud?: string; iss?: string },
  expected: { audience: string; issuer: string },
): AccessDecision {
  if (claims.principalType !== PrincipalTypes.SERVICE) {
    return { allowed: false, code: "TOKEN_NOT_SERVICE", reason: "Token is not a service token" };
  }
  if (claims.aud !== expected.audience) {
    return { allowed: false, code: "TOKEN_AUDIENCE_INVALID", reason: "Invalid token audience" };
  }
  if (claims.iss !== expected.issuer) {
    return { allowed: false, code: "TOKEN_ISSUER_INVALID", reason: "Invalid token issuer" };
  }
  return ALLOW;
}

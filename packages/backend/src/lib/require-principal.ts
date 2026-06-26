import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, PermissionScope, SystemComponent } from "@go-watchtower/database";
import {
  RUNBOOK_AUTOMATION_CLI_SCOPE,
  RUNBOOK_AUTOMATION_AUDIENCE,
  RUNBOOK_AUTOMATION_ISSUER,
} from "@go-watchtower/shared";
import { getPermissionScope, hasPermission } from "../services/permission.service.js";
import type { LifecycleAccess } from "../services/automation/execution.service.js";
import {
  evaluateHumanGuard,
  evaluateServiceGuard,
  verifyServiceTokenClaims,
  type PrincipalContext,
} from "../services/automation/principal-access.js";

/**
 * Guardie semantiche HUMAN/SERVICE (D4/A3, OPUS-03 §9.6/§9.7). Il tipo di
 * principal è **riletto dal DB** a ogni richiesta: disabilitazione o cambio ruolo
 * hanno effetto immediato anche su access token non ancora scaduti.
 */

declare module "fastify" {
  interface FastifyRequest {
    lifecycleAccess?: LifecycleAccess;
  }
}

async function readPrincipal(userId: string): Promise<PrincipalContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { principalType: true, serviceId: true, isActive: true },
  });
  if (!user) return null;
  return {
    principalType: user.principalType,
    serviceId: user.serviceId,
    isActive: user.isActive,
  };
}

/** Solo principal HUMAN attivi (le API umane sono vietate al service principal). */
export function requireHumanPrincipal() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const principal = await readPrincipal(request.user.userId);
    if (!principal) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const decision = evaluateHumanGuard(principal);
    if (!decision.allowed) {
      reply.status(403).send({ error: decision.code });
    }
  };
}

/** Generic: principal SERVICE attivo (senza vincolo sul serviceId esatto). */
export function requireServicePrincipal() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const principal = await readPrincipal(request.user.userId);
    if (!principal) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    // serviceId !== null è garantito dal CHECK DB per i SERVICE; usiamo il proprio.
    const decision = evaluateServiceGuard(principal, principal.serviceId ?? "");
    if (!decision.allowed) {
      reply.status(403).send({ error: decision.code });
    }
  };
}

/**
 * Solo lo specifico service principal (es. `runbook-automation-worker`) con i
 * claim tecnici corretti e il permesso RBAC. Un HUMAN con write NON passa; il
 * service principal riceve 403 dalle API umane.
 */
export function requireService(serviceId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // 1. Claim tecnici del token (difesa in profondità accanto alla rilettura DB).
    const claims = verifyServiceTokenClaims(
      {
        principalType: request.user.principalType,
        aud: request.user.aud,
        iss: request.user.iss,
      },
      { audience: RUNBOOK_AUTOMATION_AUDIENCE, issuer: RUNBOOK_AUTOMATION_ISSUER },
    );
    if (!claims.allowed) {
      reply.status(403).send({ error: claims.code });
      return;
    }

    // 2. Rilettura autorevole dal DB (isActive/principalType/serviceId).
    const principal = await readPrincipal(request.user.userId);
    if (!principal) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const decision = evaluateServiceGuard(principal, serviceId);
    if (!decision.allowed) {
      reply.status(403).send({ error: decision.code });
      return;
    }

    // 3. RBAC: il permesso autorizza il lifecycle dell'execution.
    const allowed = await hasPermission(
      request.user.userId,
      SystemComponent.AUTOMATIC_RUNBOOK_EXECUTION,
      "write",
    );
    if (!allowed) {
      reply.status(403).send({ error: "Permission denied" });
    }
  };
}

export function requireServiceOrCliHuman(serviceId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (request.user.principalType === "SERVICE") {
      await requireService(serviceId)(request, reply);
      if (!reply.sent) request.lifecycleAccess = { kind: "SERVICE" };
      return;
    }

    const isCliPat =
      request.user.principalType === "HUMAN" &&
      request.user.authMethod === "CLI_PAT" &&
      Array.isArray(request.user.scope) &&
      request.user.scope.includes(RUNBOOK_AUTOMATION_CLI_SCOPE);
    if (!isCliPat) {
      reply.status(403).send({ error: "PRINCIPAL_TYPE_NOT_ALLOWED" });
      return;
    }

    const principal = await readPrincipal(request.user.userId);
    if (!principal) {
      reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const humanDecision = evaluateHumanGuard(principal);
    if (!humanDecision.allowed) {
      reply.status(403).send({ error: humanDecision.code });
      return;
    }

    const params = request.params as { id?: string } | undefined;
    const executionId = params?.id;
    if (!executionId) {
      reply.status(403).send({ error: "Missing execution id" });
      return;
    }

    const scope = await getPermissionScope(
      request.user.userId,
      SystemComponent.AUTOMATIC_RUNBOOK_EXECUTION,
      "write",
    );
    if (scope === PermissionScope.NONE) {
      reply.status(403).send({ error: "Permission denied" });
      return;
    }

    request.lifecycleAccess = {
      kind: "CLI_PAT",
      userId: request.user.userId,
      permissionScope: scope,
    };
  };
}

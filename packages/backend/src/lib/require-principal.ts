import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, SystemComponent } from "@go-watchtower/database";
import {
  RUNBOOK_AUTOMATION_AUDIENCE,
  RUNBOOK_AUTOMATION_ISSUER,
} from "@go-watchtower/shared";
import { hasPermission } from "../services/permission.service.js";
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

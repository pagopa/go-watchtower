import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { SystemEventAction, SystemEventResource } from "@go-watchtower/shared";
import fp from "fastify-plugin";
import { logEvent } from "../services/system-event.service.js";

/**
 * Payload for an audit event accumulated on the request.
 * Actor context (userId, userLabel, ipAddress, userAgent) is extracted
 * automatically by the onResponse hook from the request object.
 */
export interface AuditEventPayload {
  action: SystemEventAction;
  resource?: SystemEventResource;
  resourceId?: string | null;
  resourceLabel?: string | null;
  metadata?: Record<string, unknown>;
}

declare module "fastify" {
  interface FastifyRequest {
    auditEvents: AuditEventPayload[];
  }
}

async function auditPlugin(app: FastifyInstance): Promise<void> {
  // Self-replacing getter: on first access it creates an own property on the
  // request instance with a fresh array, then returns it. Subsequent accesses
  // hit the own property directly (bypassing this prototype getter), so all
  // push() calls accumulate on the same array for the lifetime of the request.
  // A plain getter (non self-replacing) would return a new [] on every access,
  // silently discarding any push() results.
  app.decorateRequest("auditEvents", {
    getter(this: FastifyRequest) {
      const arr: AuditEventPayload[] = [];
      Object.defineProperty(this, "auditEvents", { value: arr, configurable: true, writable: true });
      return arr;
    },
  });

  app.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Only flush audit events for successful responses (2xx)
      if (reply.statusCode < 200 || reply.statusCode >= 300) return;
      if (!request.auditEvents || request.auditEvents.length === 0) return;

      // Extract actor context from the request
      const userId = request.user?.userId ?? null;
      const userLabel = request.user?.email ?? null;
      const ipAddress = request.ip;
      const userAgent = request.headers["user-agent"] ?? null;

      for (const event of request.auditEvents) {
        logEvent({
          ...event,
          userId,
          userLabel,
          ipAddress,
          userAgent,
        });
      }
    },
  );
}

export default fp(auditPlugin, {
  name: "audit",
  fastify: "5.x",
});

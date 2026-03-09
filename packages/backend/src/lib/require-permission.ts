import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission } from "../services/permission.service.js";
import type { SystemComponent } from "@go-watchtower/database";
import type { PermissionAction } from "@go-watchtower/shared";

export function requirePermission(resource: SystemComponent, action: PermissionAction) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const allowed = await hasPermission(request.user.userId, resource, action);
    if (!allowed) {
      reply.status(403).send({ error: "Permission denied" });
    }
  };
}

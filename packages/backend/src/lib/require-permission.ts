import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission } from "../services/permission.service.js";
import type { Resource } from "@go-watchtower/database";

type Action = "read" | "write" | "delete";

export function requirePermission(resource: Resource, action: Action) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const allowed = await hasPermission(request.user.userId, resource, action);
    if (!allowed) {
      reply.status(403).send({ error: "Permission denied" });
    }
  };
}

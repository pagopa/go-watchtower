import type { FastifyReply } from "fastify";

/**
 * Standardized HTTP error responses.
 * Use these instead of inline reply.status().send() for consistency.
 */
export const HttpError = {
  badRequest: (reply: FastifyReply, message = "Bad request") =>
    reply.status(400).send({ error: message }),

  unauthorized: (reply: FastifyReply, message = "Unauthorized") =>
    reply.status(401).send({ error: message }),

  forbidden: (reply: FastifyReply, message = "Permission denied") =>
    reply.status(403).send({ error: message }),

  notFound: (reply: FastifyReply, resource = "Resource") =>
    reply.status(404).send({ error: `${resource} not found` }),

  conflict: (reply: FastifyReply, message = "Resource already exists") =>
    reply.status(409).send({ error: message }),

  internal: (reply: FastifyReply, message = "Internal server error") =>
    reply.status(500).send({ error: message }),
} as const;

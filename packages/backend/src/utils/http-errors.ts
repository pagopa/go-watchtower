import type { FastifyReply } from "fastify";

/**
 * Detects Prisma/ORM error messages that could leak schema internals
 * (table names, column names, constraint names, query fragments).
 */
function isPrismaError(message: string): boolean {
  return /invocation:|Unique constraint|Foreign key|Invalid.*prisma|Argument.*missing|Unknown arg/i.test(message);
}

/**
 * Standardized HTTP error responses.
 * Use these instead of inline reply.status().send() for consistency.
 */
export const HttpError = {
  /**
   * Sanitizes the message: if it looks like a Prisma/ORM internal error,
   * logs the real message server-side and sends a generic "Bad request".
   */
  badRequest: (reply: FastifyReply, message = "Bad request") => {
    if (isPrismaError(message)) {
      reply.log.error(message);
      return reply.status(400).send({ error: "Bad request" });
    }
    return reply.status(400).send({ error: message });
  },

  unauthorized: (reply: FastifyReply, message = "Unauthorized") =>
    reply.status(401).send({ error: message }),

  forbidden: (reply: FastifyReply, message = "Permission denied") =>
    reply.status(403).send({ error: message }),

  notFound: (reply: FastifyReply, resource = "Resource") =>
    reply.status(404).send({ error: `${resource} not found` }),

  conflict: (reply: FastifyReply, message = "Resource already exists") =>
    reply.status(409).send({ error: message }),

  /**
   * Logs the real error server-side and returns a generic message to the client
   * to avoid leaking internal details (table names, query structure, stack traces).
   */
  internal: (reply: FastifyReply, message = "Internal server error") => {
    reply.log.error(message);
    return reply.status(500).send({ error: "Internal server error" });
  },
} as const;

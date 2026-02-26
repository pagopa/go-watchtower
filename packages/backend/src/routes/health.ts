import type { FastifyInstance } from "fastify";
import { prisma } from "@go-watchtower/database";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Health check endpoint",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              timestamp: { type: "string" },
              database: { type: "string" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      let dbStatus = "connected";

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbStatus = "disconnected";
      }

      reply.send({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: dbStatus,
      });
    }
  );
}

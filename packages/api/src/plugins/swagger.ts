import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "GO Watchtower API",
        description: "API per la gestione delle analisi degli allarmi",
        version: "1.0.0",
      },
      servers: [
        {
          url: "http://localhost:3001",
          description: "Development server",
        },
      ],
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "health", description: "Health check endpoints" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}

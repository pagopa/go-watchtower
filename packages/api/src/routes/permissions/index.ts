import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getUserPermissions } from "../../services/permission.service.js";
import {
  PermissionsResponseSchema,
  ErrorResponseSchema,
} from "./schemas.js";

export async function permissionRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Get current user's permissions
  app.get(
    "/permissions/me",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["permissions"],
        summary: "Get current user's permissions",
        security: [{ bearerAuth: [] }],
        response: {
          200: PermissionsResponseSchema,
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const permissions = await getUserPermissions(request.user.userId);

        reply.send({ permissions });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to fetch permissions";
        reply.status(500).send({ error: message });
      }
    }
  );
}

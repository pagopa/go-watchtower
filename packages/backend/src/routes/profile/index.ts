import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { requireHumanPrincipal } from "../../lib/require-principal.js";
import { logEvent } from "../../services/system-event.service.js";
import {
  generateCliToken,
  getCliTokenMetadata,
  InvalidCliTokenExpirationError,
  revokeCliToken,
} from "../../services/cli-token.service.js";
import {
  CliTokenMetadataResponseSchema,
  CreateCliTokenBodySchema,
  CreateCliTokenResponseSchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  type CreateCliTokenBody,
} from "../auth/schemas.js";

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export async function profileRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  app.get(
    "/me/cli-token",
    {
      onRequest: [app.authenticate, requireHumanPrincipal()],
      schema: {
        tags: ["Profile"],
        summary: "Get current user's CLI token metadata and policy",
        security: [{ bearerAuth: [] }],
        response: { 200: CliTokenMetadataResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const metadata = await getCliTokenMetadata(request.user.userId);
      reply.send({
        hint: metadata.hint,
        createdAt: iso(metadata.createdAt),
        lastUsedAt: iso(metadata.lastUsedAt),
        expiresAt: iso(metadata.expiresAt),
        defaultTtlDays: metadata.defaultTtlDays,
        maxTtlDays: metadata.maxTtlDays,
      });
    },
  );

  app.post<{ Body: CreateCliTokenBody }>(
    "/me/cli-token",
    {
      onRequest: [app.authenticate, requireHumanPrincipal()],
      schema: {
        tags: ["Profile"],
        summary: "Generate or rotate current user's CLI token",
        security: [{ bearerAuth: [] }],
        body: CreateCliTokenBodySchema,
        response: { 201: CreateCliTokenResponseSchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 500: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const token = await generateCliToken(request.user.userId, request.body.expiresInDays);
        logEvent({
          action: SystemEventActions.USER_CLI_TOKEN_CREATED,
          resource: SystemEventResources.AUTH,
          userId: request.user.userId,
          userLabel: request.user.name ? `${request.user.name} (${request.user.email})` : request.user.email,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
        reply.status(201).send({
          token: token.token,
          hint: token.hint,
          createdAt: token.createdAt.toISOString(),
          expiresAt: token.expiresAt.toISOString(),
          defaultTtlDays: token.defaultTtlDays,
          maxTtlDays: token.maxTtlDays,
        });
      } catch (error) {
        if (error instanceof InvalidCliTokenExpirationError) {
          reply.status(400).send({ error: error.message });
          return;
        }
        request.log.error({ error }, "CLI token generation failed");
        reply.status(500).send({ error: "CLI token generation failed" });
      }
    },
  );

  app.delete(
    "/me/cli-token",
    {
      onRequest: [app.authenticate, requireHumanPrincipal()],
      schema: {
        tags: ["Profile"],
        summary: "Revoke current user's CLI token",
        security: [{ bearerAuth: [] }],
        response: { 200: MessageResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      await revokeCliToken(request.user.userId);
      logEvent({
        action: SystemEventActions.USER_CLI_TOKEN_REVOKED,
        resource: SystemEventResources.AUTH,
        userId: request.user.userId,
        userLabel: request.user.name ? `${request.user.name} (${request.user.email})` : request.user.email,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      reply.send({ message: "CLI token revoked" });
    },
  );
}

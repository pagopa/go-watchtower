import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";

export interface JwtPayload {
  userId: string;
  name: string;
  email: string;
  role: string;
  type: "access";
  // Runbook Automation (D4/A2): claim tecnici. Per gli HUMAN principalType="HUMAN"
  // e serviceId/aud/iss sono assenti. Per il service principal sono valorizzati e
  // verificati dalle guardie. NOTA: i claim sono un fast-path; l'autorità AuthZ è
  // sempre la rilettura dal DB (§9.6).
  principalType?: "HUMAN" | "SERVICE";
  serviceId?: string;
  aud?: string;
  iss?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(cookie, {
    secret: env.COOKIE_SECRET || env.JWT_SECRET,
    hook: "onRequest",
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
    },
    cookie: {
      cookieName: "accessToken",
      signed: false,
    },
  });

  // Decorator for protected routes
  app.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();

        // Verify token type
        if (request.user.type !== "access") {
          reply.status(401).send({ error: "Invalid token type" });
          return;
        }
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    }
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

// Helper to generate access token (HUMAN principal by default)
export function generateAccessToken(
  app: FastifyInstance,
  payload: Omit<JwtPayload, "type" | "principalType" | "serviceId" | "aud" | "iss"> &
    Partial<Pick<JwtPayload, "principalType">>
): string {
  return app.jwt.sign({
    ...payload,
    principalType: payload.principalType ?? "HUMAN",
    type: "access",
  });
}

/**
 * Access token del service principal (D4/A2): claim tecnici `principalType=SERVICE`,
 * `serviceId`, `aud=watchtower-automation`, `iss=go-watchtower`. TTL breve (10 min),
 * dentro l'intervallo 5-15 minuti.
 */
export function generateServiceAccessToken(
  app: FastifyInstance,
  params: {
    userId: string;
    name: string;
    email: string;
    role: string;
    serviceId: string;
    audience: string;
    issuer: string;
    expiresInSeconds: number;
  }
): string {
  const payload: JwtPayload = {
    userId: params.userId,
    name: params.name,
    email: params.email,
    role: params.role,
    type: "access",
    principalType: "SERVICE",
    serviceId: params.serviceId,
    aud: params.audience,
    iss: params.issuer,
  };
  return app.jwt.sign(payload, { expiresIn: params.expiresInSeconds });
}

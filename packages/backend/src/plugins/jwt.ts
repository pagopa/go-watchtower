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
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export async function registerJwt(app: FastifyInstance): Promise<void> {
  await app.register(cookie, {
    secret: env.JWT_SECRET,
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

// Helper to generate access token
export function generateAccessToken(
  app: FastifyInstance,
  payload: Omit<JwtPayload, "type">
): string {
  return app.jwt.sign({
    ...payload,
    type: "access",
  });
}

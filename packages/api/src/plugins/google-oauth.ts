import oauth2 from "@fastify/oauth2";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export async function registerGoogleOAuth(app: FastifyInstance): Promise<void> {
  await app.register(oauth2, {
    name: "googleOAuth2",
    scope: ["profile", "email"],
    credentials: {
      client: {
        id: env.GOOGLE_CLIENT_ID,
        secret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    startRedirectPath: "/auth/google",
    callbackUri: env.GOOGLE_CALLBACK_URL,
    discovery: {
      issuer: "https://accounts.google.com",
    },
    pkce: "S256",
  });
}

declare module "fastify" {
  interface FastifyInstance {
    googleOAuth2: oauth2.OAuth2Namespace;
  }
}

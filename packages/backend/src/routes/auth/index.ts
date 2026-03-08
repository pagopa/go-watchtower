import type { FastifyInstance, FastifyReply } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  RegisterBodySchema,
  LoginBodySchema,
  RefreshBodySchema,
  AuthResponseSchema,
  TokenResponseSchema,
  ErrorResponseSchema,
  MeResponseSchema,
  SessionsResponseSchema,
  RevokeSessionParamsSchema,
  MessageResponseSchema,
  GoogleCallbackBodySchema,
  type RegisterBody,
  type LoginBody,
  type RefreshBody,
  type RevokeSessionParams,
  type GoogleCallbackBody,
} from "./schemas.js";
import {
  registerUser,
  loginUser,
  findOrCreateGoogleUser,
  getUserById,
  type GoogleUserInfo,
  type SafeUser,
} from "../../services/auth.service.js";
import {
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  getActiveSessions,
  revokeSession,
} from "../../services/token.service.js";
import { generateAccessToken } from "../../plugins/jwt.js";
import { authRateLimitConfig } from "../../plugins/rate-limit.js";
import { env } from "../../config/env.js";
import { logEvent } from "../../services/system-event.service.js";
import { SystemEventActions, SystemEventResources } from "@go-watchtower/shared";
import { HttpError } from "../../utils/http-errors.js";
import type { JwtPayload } from "../../plugins/jwt.js";

// Access token expires in 15 minutes (in seconds)
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;

function formatUser(user: SafeUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.roleName,
    provider: user.provider,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function getClientInfo(request: { headers: { [key: string]: unknown }; ip: string }) {
  return {
    userAgent: (request.headers["user-agent"] as string) || undefined,
    ipAddress: request.ip,
  };
}

function setTokenCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  // Access token cookie (short-lived, httpOnly)
  reply.setCookie("accessToken", accessToken, {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    maxAge: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  });

  // Refresh token cookie (long-lived, httpOnly, more restrictive path)
  reply.setCookie("refreshToken", refreshToken, {
    path: "/auth", // Only sent to auth endpoints
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    maxAge: env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60,
  });
}

function clearTokenCookies(reply: FastifyReply): void {
  reply.clearCookie("accessToken", { path: "/" });
  reply.clearCookie("refreshToken", { path: "/auth" });
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();

  // Register
  app.post<{ Body: RegisterBody }>(
    "/register",
    {
      ...authRateLimitConfig,
      schema: {
        tags: ["auth"],
        summary: "Register a new user",
        body: RegisterBodySchema,
        response: {
          201: AuthResponseSchema,
          400: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await registerUser(request.body);
        const clientInfo = getClientInfo(request);

        const accessToken = generateAccessToken(app, {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.roleName,
        });

        const refreshToken = await createRefreshToken({
          userId: user.id,
          ...clientInfo,
        });

        setTokenCookies(reply, accessToken, refreshToken);

        reply.status(201).send({
          user: formatUser(user),
          accessToken,
          refreshToken,
          expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Registration failed";
        HttpError.badRequest(reply, message);
      }
    }
  );

  // Login
  app.post<{ Body: LoginBody }>(
    "/login",
    {
      ...authRateLimitConfig,
      schema: {
        tags: ["auth"],
        summary: "Login with email and password",
        body: LoginBodySchema,
        response: {
          200: AuthResponseSchema,
          401: ErrorResponseSchema,
          429: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await loginUser(request.body);
        const clientInfo = getClientInfo(request);

        const accessToken = generateAccessToken(app, {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.roleName,
        });

        const refreshToken = await createRefreshToken({
          userId: user.id,
          ...clientInfo,
        });

        setTokenCookies(reply, accessToken, refreshToken);

        // audit: unauthenticated endpoint -- direct call, request.user not available
        logEvent({
          action: SystemEventActions.USER_LOGIN,
          resource: SystemEventResources.AUTH,
          userId: user.id,
          userLabel: `${user.name} (${user.email})`,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send({
          user: formatUser(user),
          accessToken,
          refreshToken,
          expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Login failed";

        // audit: error event -- direct call, not via onResponse hook
        logEvent({
          action: SystemEventActions.USER_LOGIN_FAILED,
          resource: SystemEventResources.AUTH,
          userLabel: request.body.email,
          metadata: { reason: message },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        HttpError.unauthorized(reply, message);
      }
    }
  );

  // Refresh tokens
  app.post<{ Body: RefreshBody }>(
    "/refresh",
    {
      schema: {
        tags: ["auth"],
        summary: "Refresh access token using refresh token",
        body: RefreshBodySchema,
        response: {
          200: TokenResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      // Also check cookie if not in body
      const tokenToUse =
        refreshToken || (request.cookies["refreshToken"] as string);

      if (!tokenToUse) {
        HttpError.unauthorized(reply, "Refresh token required");
        return;
      }

      const validation = await validateRefreshToken(tokenToUse);
      if (!validation) {
        clearTokenCookies(reply);
        HttpError.unauthorized(reply, "Invalid or expired refresh token");
        return;
      }

      const user = await getUserById(validation.userId);
      if (!user) {
        clearTokenCookies(reply);
        HttpError.unauthorized(reply, "User not found");
        return;
      }

      const clientInfo = getClientInfo(request);

      // Rotate refresh token
      const newRefreshToken = await rotateRefreshToken(tokenToUse, {
        userId: user.id,
        ...clientInfo,
      });

      if (!newRefreshToken) {
        clearTokenCookies(reply);
        HttpError.unauthorized(reply, "Token rotation failed");
        return;
      }

      const accessToken = generateAccessToken(app, {
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.roleName,
      });

      setTokenCookies(reply, accessToken, newRefreshToken);

      reply.send({
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      });
    }
  );

  // Logout
  app.post(
    "/logout",
    {
      schema: {
        tags: ["auth"],
        summary: "Logout and revoke tokens",
        response: {
          200: MessageResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const refreshToken = request.cookies["refreshToken"] as string;

      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
      }

      // Try to identify the user from a verified token (cookie or Bearer header).
      // We use jwtVerify() instead of decode() to prevent forged token abuse.
      let logoutUserId: string | null = null;
      let logoutUserLabel: string | null = null;
      try {
        await request.jwtVerify();
        const payload = request.user as JwtPayload;
        logoutUserId = payload.userId;
        logoutUserLabel = payload.name
          ? `${payload.name} (${payload.email})`
          : payload.email;
      } catch {
        // token expired or missing — audit without user identity
      }

      // audit: unauthenticated endpoint -- direct call, request.user not available (token may be expired)
      logEvent({
        action: SystemEventActions.USER_LOGOUT,
        resource: SystemEventResources.AUTH,
        userId: logoutUserId,
        userLabel: logoutUserLabel,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      clearTokenCookies(reply);
      reply.send({ message: "Logged out successfully" });
    }
  );

  // Logout from all devices
  app.post(
    "/logout-all",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Logout from all devices",
        security: [{ bearerAuth: [] }],
        response: {
          200: MessageResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await revokeAllUserTokens(request.user.userId);
      clearTokenCookies(reply);
      reply.send({ message: "Logged out from all devices" });
    }
  );

  // Get current user
  app.get(
    "/me",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Get current authenticated user",
        security: [{ bearerAuth: [] }],
        response: {
          200: MeResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await getUserById(request.user.userId);
      if (!user) {
        HttpError.unauthorized(reply, "User not found");
        return;
      }

      reply.send(formatUser(user));
    }
  );

  // Get active sessions
  app.get(
    "/sessions",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Get all active sessions for current user",
        security: [{ bearerAuth: [] }],
        response: {
          200: SessionsResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sessions = await getActiveSessions(request.user.userId);

      const formattedSessions = sessions.map((session: (typeof sessions)[number]) => ({
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: false, // We can't easily determine this without storing the token hash in session
      }));

      reply.send({ sessions: formattedSessions });
    }
  );

  // Revoke specific session
  app.delete<{ Params: RevokeSessionParams }>(
    "/sessions/:sessionId",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        summary: "Revoke a specific session",
        security: [{ bearerAuth: [] }],
        params: RevokeSessionParamsSchema,
        response: {
          200: MessageResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const success = await revokeSession(
        request.user.userId,
        request.params.sessionId
      );

      if (!success) {
        HttpError.notFound(reply, "Session");
        return;
      }

      request.auditEvents.push({
        action: SystemEventActions.USER_TOKEN_REVOKED,
        resource: SystemEventResources.AUTH,
        resourceId: request.params.sessionId,
      });

      reply.send({ message: "Session revoked" });
    }
  );

  // Google OAuth callback (redirect-based)
  app.get(
    "/google/callback",
    {
      schema: {
        tags: ["auth"],
        summary: "Google OAuth callback",
        hide: true,
      },
    },
    async function (request, reply) {
      try {
        const { token } =
          await this.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(
            request
          );

        // Fetch user info from Google
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
            },
          }
        );

        if (!userInfoResponse.ok) {
          throw new Error("Failed to fetch user info from Google");
        }

        const googleUser = (await userInfoResponse.json()) as GoogleUserInfo;
        const user = await findOrCreateGoogleUser(googleUser);
        const clientInfo = getClientInfo(request);

        const accessToken = generateAccessToken(app, {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.roleName,
        });

        const refreshToken = await createRefreshToken({
          userId: user.id,
          ...clientInfo,
        });

        setTokenCookies(reply, accessToken, refreshToken);

        // audit: unauthenticated endpoint -- direct call, request.user not available
        logEvent({
          action: SystemEventActions.USER_LOGIN_GOOGLE,
          resource: SystemEventResources.AUTH,
          userId: user.id,
          userLabel: `${user.name} (${user.email})`,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        // Redirect to frontend — tokens are in httpOnly cookies, not in URL
        reply.redirect(`${env.FRONTEND_URL}/auth/callback`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Google authentication failed";
        reply.redirect(
          `${env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(message)}`
        );
      }
    }
  );

  // Google OAuth callback (POST - for NextAuth)
  app.post<{ Body: GoogleCallbackBody }>(
    "/google/callback",
    {
      schema: {
        tags: ["auth"],
        summary: "Google OAuth callback for NextAuth",
        body: GoogleCallbackBodySchema,
        response: {
          200: AuthResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { idToken, accessToken: googleAccessToken } = request.body;

        if (!idToken && !googleAccessToken) {
          HttpError.unauthorized(reply, "idToken or accessToken required");
          return;
        }

        let googleUser: GoogleUserInfo;

        if (idToken) {
          // Verify ID token with Google
          const tokenInfoResponse = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
          );

          if (!tokenInfoResponse.ok) {
            throw new Error("Invalid ID token");
          }

          const tokenInfo = (await tokenInfoResponse.json()) as {
            sub: string;
            email: string;
            name?: string;
            picture?: string;
          };
          const name = (tokenInfo.name || tokenInfo.email.split("@")[0]) as string;
          googleUser = {
            sub: tokenInfo.sub,
            email: tokenInfo.email,
            name,
            picture: tokenInfo.picture,
          };
        } else {
          // Use access token to fetch user info
          const userInfoResponse = await fetch(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            {
              headers: {
                Authorization: `Bearer ${googleAccessToken}`,
              },
            }
          );

          if (!userInfoResponse.ok) {
            throw new Error("Failed to fetch user info from Google");
          }

          googleUser = (await userInfoResponse.json()) as GoogleUserInfo;
        }

        const user = await findOrCreateGoogleUser(googleUser);
        const clientInfo = getClientInfo(request);

        const accessToken = generateAccessToken(app, {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.roleName,
        });

        const refreshToken = await createRefreshToken({
          userId: user.id,
          ...clientInfo,
        });

        setTokenCookies(reply, accessToken, refreshToken);

        // audit: unauthenticated endpoint -- direct call, request.user not available
        logEvent({
          action: SystemEventActions.USER_LOGIN_GOOGLE,
          resource: SystemEventResources.AUTH,
          userId: user.id,
          userLabel: `${user.name} (${user.email})`,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        reply.send({
          user: formatUser(user),
          accessToken,
          refreshToken,
          expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Google authentication failed";
        HttpError.unauthorized(reply, message);
      }
    }
  );
}

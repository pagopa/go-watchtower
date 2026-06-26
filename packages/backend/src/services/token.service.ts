import crypto from "node:crypto";
import { prisma, PrincipalType, RefreshTokenSource } from "@go-watchtower/database";
import { env } from "../config/env.js";
import {
  deriveRotatedRefreshToken,
  hashRefreshToken,
  isRecentRotationReuse,
} from "./token-rotation.js";

const REFRESH_TOKEN_BYTES = 32;

export interface RefreshTokenData {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  source?: RefreshTokenSource;
  cliTokenHash?: string;
}

function hashToken(token: string): string {
  return hashRefreshToken(token);
}

function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

export async function createRefreshToken(
  data: RefreshTokenData
): Promise<string> {
  const token = generateRefreshToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_DAYS);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: data.userId,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
      source: data.source ?? RefreshTokenSource.HUMAN_LOGIN,
      cliTokenHash: data.cliTokenHash ?? null,
      expiresAt,
    },
  });

  return token;
}

export async function validateRefreshToken(
  token: string
): Promise<{ userId: string; tokenId: string } | null> {
  const tokenHash = hashToken(token);

  const refreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!refreshToken) {
    return null;
  }

  // Check if revoked
  if (refreshToken.revokedAt) {
    return null;
  }

  // Check if expired
  if (refreshToken.expiresAt < new Date()) {
    return null;
  }

  // Check if user/PAT is active
  if (!isRefreshTokenPrincipalValid(refreshToken, new Date())) {
    return null;
  }

  return {
    userId: refreshToken.userId,
    tokenId: refreshToken.id,
  };
}

export interface RotatedRefreshToken {
  userId: string;
  refreshToken: string;
  reusedRecentRotation: boolean;
  source: RefreshTokenSource;
  cliTokenHash: string | null;
  cliTokenExpiresAt: Date | null;
}

function isRefreshTokenPrincipalValid(
  refreshToken: {
    source: RefreshTokenSource;
    cliTokenHash: string | null;
    user: {
      isActive: boolean;
      principalType: PrincipalType;
      cliTokenHash: string | null;
      cliTokenExpiresAt: Date | null;
    };
  },
  now: Date
): boolean {
  if (!refreshToken.user.isActive) return false;
  if (refreshToken.source !== RefreshTokenSource.CLI_PAT) return true;
  return (
    refreshToken.user.principalType === PrincipalType.HUMAN &&
    refreshToken.cliTokenHash !== null &&
    refreshToken.user.cliTokenHash === refreshToken.cliTokenHash &&
    refreshToken.user.cliTokenExpiresAt !== null &&
    refreshToken.user.cliTokenExpiresAt > now
  );
}

export async function rotateRefreshToken(
  oldToken: string,
  data: Pick<RefreshTokenData, "userAgent" | "ipAddress">
): Promise<RotatedRefreshToken | null> {
  const tokenHash = hashToken(oldToken);
  const newToken = deriveRotatedRefreshToken(oldToken, env.JWT_SECRET);
  const newTokenHash = hashToken(newToken);
  const now = new Date();

  const oldRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!oldRefreshToken) {
    return null;
  }

  if (oldRefreshToken.expiresAt < now || !isRefreshTokenPrincipalValid(oldRefreshToken, now)) {
    return null;
  }

  if (oldRefreshToken.revokedAt) {
    if (
      isRecentRotationReuse(
        oldRefreshToken,
        newTokenHash,
        env.REFRESH_TOKEN_ROTATION_GRACE_SECONDS,
        now
      )
    ) {
      const replacement = await prisma.refreshToken.findUnique({
        where: { tokenHash: newTokenHash },
        include: { user: true },
      });

      if (
        !replacement ||
        replacement.revokedAt ||
        replacement.expiresAt < now ||
        !isRefreshTokenPrincipalValid(replacement, now)
      ) {
        return null;
      }

      return {
        userId: replacement.userId,
        refreshToken: newToken,
        reusedRecentRotation: true,
        source: replacement.source,
        cliTokenHash: replacement.cliTokenHash,
        cliTokenExpiresAt: replacement.user.cliTokenExpiresAt,
      };
    }

    // A revoked refresh token can still arrive from a stale NextAuth/JWT
    // request that was already in flight when another request rotated it.
    // Reject the stale request, but do not revoke the active replacement:
    // token-family revocation here creates false logouts in multi-tab/dev
    // scenarios where the valid token has already been issued.
    return null;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_DAYS);

  const rotationResult = await prisma.$transaction(async (tx) => {
    const update = await tx.refreshToken.updateMany({
      where: {
        id: oldRefreshToken.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        replacedBy: newTokenHash,
      },
    });

    if (update.count === 0) {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: { revokedAt: true, replacedBy: true },
      });

      if (
        !current ||
        !isRecentRotationReuse(
          current,
          newTokenHash,
          env.REFRESH_TOKEN_ROTATION_GRACE_SECONDS
        )
      ) {
        return null;
      }

      const replacement = await tx.refreshToken.findUnique({
        where: { tokenHash: newTokenHash },
        select: {
          revokedAt: true,
          expiresAt: true,
          source: true,
          cliTokenHash: true,
          user: { select: { isActive: true, principalType: true, cliTokenHash: true, cliTokenExpiresAt: true } },
        },
      });

      return replacement &&
        !replacement.revokedAt &&
        replacement.expiresAt >= now &&
        isRefreshTokenPrincipalValid(replacement, now)
        ? "reused"
        : null;
    }

    await tx.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: oldRefreshToken.userId,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        source: oldRefreshToken.source,
        cliTokenHash: oldRefreshToken.cliTokenHash,
        expiresAt,
      },
    });

    return "rotated";
  });

  if (!rotationResult) {
    return null;
  }

  return {
    userId: oldRefreshToken.userId,
    refreshToken: newToken,
    reusedRecentRotation: rotationResult === "reused",
    source: oldRefreshToken.source,
    cliTokenHash: oldRefreshToken.cliTokenHash,
    cliTokenExpiresAt: oldRefreshToken.user.cliTokenExpiresAt,
  };
}

export async function revokeRefreshToken(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  try {
    await prisma.refreshToken.update({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function getActiveSessions(userId: string) {
  const tokens = await prisma.refreshToken.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return tokens;
}

export async function revokeSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const result = await prisma.refreshToken.updateMany({
    where: {
      id: sessionId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  return result.count > 0;
}

// Cleanup expired tokens (should be run periodically)
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        {
          revokedAt: {
            lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          },
        },
      ],
    },
  });

  return result.count;
}

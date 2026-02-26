import crypto from "node:crypto";
import { prisma } from "@go-watchtower/database";

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenData {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
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
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: data.userId,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress,
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
    // Token reuse detected - revoke all tokens for this user (security measure)
    await revokeAllUserTokens(refreshToken.userId);
    return null;
  }

  // Check if expired
  if (refreshToken.expiresAt < new Date()) {
    return null;
  }

  // Check if user is active
  if (!refreshToken.user.isActive) {
    return null;
  }

  return {
    userId: refreshToken.userId,
    tokenId: refreshToken.id,
  };
}

export async function rotateRefreshToken(
  oldToken: string,
  data: RefreshTokenData
): Promise<string | null> {
  const tokenHash = hashToken(oldToken);

  const oldRefreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (!oldRefreshToken || oldRefreshToken.revokedAt) {
    return null;
  }

  // Generate new token
  const newToken = generateRefreshToken();
  const newTokenHash = hashToken(newToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Atomic operation: revoke old token and create new one
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: oldRefreshToken.id },
      data: {
        revokedAt: new Date(),
        replacedBy: newTokenHash,
      },
    }),
    prisma.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: data.userId,
        userAgent: data.userAgent,
        ipAddress: data.ipAddress,
        expiresAt,
      },
    }),
  ]);

  return newToken;
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

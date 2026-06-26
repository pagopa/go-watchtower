import crypto from "node:crypto";
import { prisma, PrincipalType, Prisma } from "@go-watchtower/database";
import {
  CLI_TOKEN_DEFAULT_TTL_DAYS_SETTING_KEY,
  CLI_TOKEN_HARD_MAX_TTL_DAYS,
  CLI_TOKEN_MAX_TTL_DAYS_SETTING_KEY,
} from "@go-watchtower/shared";
import { env } from "../config/env.js";
import { toSafeUser, type SafeUser } from "./auth.service.js";

const CLI_TOKEN_BYTES = 32;

export interface CliTokenPolicy {
  readonly defaultTtlDays: number;
  readonly maxTtlDays: number;
}

export interface CliTokenMetadata {
  readonly hint: string | null;
  readonly createdAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly defaultTtlDays: number;
  readonly maxTtlDays: number;
}

export interface GeneratedCliToken {
  readonly token: string;
  readonly hint: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly defaultTtlDays: number;
  readonly maxTtlDays: number;
}

export class InvalidCliTokenExpirationError extends Error {
  constructor() {
    super("Invalid CLI token expiration");
    this.name = "InvalidCliTokenExpirationError";
  }
}

export interface CliTokenLogin {
  readonly user: SafeUser;
  readonly cliTokenHash: string;
  readonly cliTokenExpiresAt: Date;
}

function requireCliTokenPepper(): string {
  if (env.WATCHTOWER_CLI_TOKEN_PEPPER !== "") return env.WATCHTOWER_CLI_TOKEN_PEPPER;
  throw new Error("WATCHTOWER_CLI_TOKEN_PEPPER is required for CLI token operations");
}

function hashCliToken(token: string): string {
  return crypto.createHmac("sha256", requireCliTokenPepper()).update(token).digest("hex");
}

function generateRawCliToken(): string {
  return `wtcli_${crypto.randomBytes(CLI_TOKEN_BYTES).toString("base64url")}`;
}

function tokenHint(token: string): string {
  return token.slice(-8);
}

function parsePositiveSetting(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function getCliTokenPolicy(tx: Prisma.TransactionClient = prisma): Promise<CliTokenPolicy> {
  const [defaultSetting, maxSetting] = await Promise.all([
    tx.systemSetting.findUnique({ where: { key: CLI_TOKEN_DEFAULT_TTL_DAYS_SETTING_KEY } }),
    tx.systemSetting.findUnique({ where: { key: CLI_TOKEN_MAX_TTL_DAYS_SETTING_KEY } }),
  ]);
  const defaultTtlDays = parsePositiveSetting(defaultSetting?.value);
  const configuredMaxTtlDays = parsePositiveSetting(maxSetting?.value);
  if (defaultTtlDays === null || configuredMaxTtlDays === null) {
    throw new Error("CLI token TTL system settings are missing or invalid");
  }
  const maxTtlDays = Math.min(configuredMaxTtlDays, CLI_TOKEN_HARD_MAX_TTL_DAYS);
  if (defaultTtlDays > maxTtlDays) {
    throw new Error("CLI token default TTL exceeds max TTL");
  }
  return { defaultTtlDays, maxTtlDays };
}

export async function getCliTokenMetadata(userId: string): Promise<CliTokenMetadata> {
  const [policy, user] = await Promise.all([
    getCliTokenPolicy(),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        cliTokenHash: true,
        cliTokenHint: true,
        cliTokenCreatedAt: true,
        cliTokenLastUsedAt: true,
        cliTokenExpiresAt: true,
      },
    }),
  ]);
  const hasToken = user !== null && user.cliTokenHash !== null;
  if (!hasToken) {
    return {
      hint: null,
      createdAt: null,
      lastUsedAt: null,
      expiresAt: null,
      defaultTtlDays: policy.defaultTtlDays,
      maxTtlDays: policy.maxTtlDays,
    };
  }
  return {
    hint: user.cliTokenHint,
    createdAt: user.cliTokenCreatedAt,
    lastUsedAt: user.cliTokenLastUsedAt,
    expiresAt: user.cliTokenExpiresAt,
    defaultTtlDays: policy.defaultTtlDays,
    maxTtlDays: policy.maxTtlDays,
  };
}

export async function generateCliToken(userId: string, expiresInDays?: number): Promise<GeneratedCliToken> {
  return prisma.$transaction(async (tx) => {
    const policy = await getCliTokenPolicy(tx);
    const ttlDays = expiresInDays ?? policy.defaultTtlDays;
    if (!Number.isSafeInteger(ttlDays) || ttlDays <= 0 || ttlDays > policy.maxTtlDays) {
      throw new InvalidCliTokenExpirationError();
    }
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, principalType: true, isActive: true, cliTokenHash: true },
    });
    if (!user || !user.isActive || user.principalType !== PrincipalType.HUMAN) {
      throw new Error("CLI token can be generated only for active human users");
    }
    const token = generateRawCliToken();
    const cliTokenHash = hashCliToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
    if (user.cliTokenHash !== null) {
      await tx.refreshToken.updateMany({
        where: { userId, source: "CLI_PAT", cliTokenHash: user.cliTokenHash, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        cliTokenHash,
        cliTokenHint: tokenHint(token),
        cliTokenCreatedAt: now,
        cliTokenLastUsedAt: null,
        cliTokenExpiresAt: expiresAt,
      },
    });
    return {
      token,
      hint: tokenHint(token),
      createdAt: now,
      expiresAt,
      defaultTtlDays: policy.defaultTtlDays,
      maxTtlDays: policy.maxTtlDays,
    };
  });
}

export async function revokeCliToken(userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { cliTokenHash: true },
    });
    if (!user?.cliTokenHash) return false;
    const now = new Date();
    await tx.refreshToken.updateMany({
      where: { userId, source: "CLI_PAT", cliTokenHash: user.cliTokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        cliTokenHash: null,
        cliTokenHint: null,
        cliTokenCreatedAt: null,
        cliTokenLastUsedAt: null,
        cliTokenExpiresAt: null,
      },
    });
    return true;
  });
}

export async function loginCliToken(token: string): Promise<CliTokenLogin | null> {
  const cliTokenHash = hashCliToken(token);
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { cliTokenHash },
    include: { role: true },
  });
  if (
    !user ||
    !user.isActive ||
    user.principalType !== PrincipalType.HUMAN ||
    user.cliTokenExpiresAt === null ||
    user.cliTokenExpiresAt <= now
  ) {
    return null;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { cliTokenLastUsedAt: now },
  });
  return {
    user: toSafeUser(user),
    cliTokenHash,
    cliTokenExpiresAt: user.cliTokenExpiresAt,
  };
}

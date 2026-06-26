import { prisma, type User, type Role, AuthProvider, PrincipalType } from "@go-watchtower/database";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { canHumanLogin, canServiceLogin } from "./automation/principal-access.js";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

// User without credential material, with role name from join.
type SensitiveUserField =
  | "passwordHash"
  | "cliTokenHash"
  | "cliTokenHint"
  | "cliTokenCreatedAt"
  | "cliTokenLastUsedAt"
  | "cliTokenExpiresAt";

export type SafeUser = Omit<User, SensitiveUserField> & { roleName: string };

type UserWithRole = User & { role: Role };

export function toSafeUser(user: UserWithRole): SafeUser {
  const {
    passwordHash: _passwordHash,
    cliTokenHash: _cliTokenHash,
    cliTokenHint: _cliTokenHint,
    cliTokenCreatedAt: _cliTokenCreatedAt,
    cliTokenLastUsedAt: _cliTokenLastUsedAt,
    cliTokenExpiresAt: _cliTokenExpiresAt,
    role,
    ...rest
  } = user;
  return { ...rest, roleName: role.name };
}

// Cache for default role ID to avoid repeated DB queries
let defaultRoleId: string | null = null;

async function getDefaultRoleId(): Promise<string> {
  if (defaultRoleId) {
    return defaultRoleId;
  }

  const defaultRole = await prisma.role.findFirst({
    where: { isDefault: true },
  });

  if (!defaultRole) {
    throw new Error("Default role not configured. Please run database seed.");
  }

  defaultRoleId = defaultRole.id;
  return defaultRole.id;
}

export async function registerUser(input: RegisterInput): Promise<SafeUser> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const roleId = await getDefaultRoleId();

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      roleId,
      provider: AuthProvider.LOCAL,
    },
    include: { role: true },
  });

  return toSafeUser(user);
}

/** Distingue il rifiuto per tipo di principal (403) dalle credenziali invalide (401). */
export class PrincipalTypeNotAllowedError extends Error {
  constructor() {
    super("PRINCIPAL_TYPE_NOT_ALLOWED");
    this.name = "PrincipalTypeNotAllowedError";
  }
}

export async function loginUser(input: LoginInput): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { role: true },
  });

  if (!user || !user.passwordHash) {
    throw new Error("Invalid credentials");
  }

  if (!user.isActive) {
    throw new Error("User is disabled");
  }

  // A2: /auth/login accetta solo HUMAN; un account SERVICE riceve 403 anche con
  // password corretta. Il controllo precede la verifica password per evitare di
  // trattare il service principal come un login umano.
  if (user.principalType !== PrincipalType.HUMAN) {
    throw new PrincipalTypeNotAllowedError();
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid credentials");
  }

  if (!canHumanLogin({ principalType: user.principalType, serviceId: user.serviceId, isActive: user.isActive })) {
    throw new PrincipalTypeNotAllowedError();
  }

  return toSafeUser(user);
}

export interface ServiceLoginInput {
  serviceId: string;
  password: string;
}

/**
 * Login del service principal (D4/A2): accetta solo account SERVICE attivi.
 * Un account HUMAN, un serviceId sconosciuto, inattivo o password errata
 * producono lo **stesso** errore 401 indistinguibile (anti-enumerazione, §9.6).
 */
export async function loginServicePrincipal(input: ServiceLoginInput): Promise<SafeUser> {
  const user = await prisma.user.findUnique({
    where: { serviceId: input.serviceId },
    include: { role: true },
  });

  const invalid = new Error("Invalid credentials");

  if (
    !user ||
    !user.passwordHash ||
    !canServiceLogin({ principalType: user.principalType, serviceId: user.serviceId, isActive: user.isActive })
  ) {
    throw invalid;
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw invalid;
  }

  return toSafeUser(user);
}

// Only allow Google accounts from these domains
const ALLOWED_GOOGLE_DOMAINS = ["pagopa.it", "external.pagopa.it"];

export async function findOrCreateGoogleUser(
  googleUser: GoogleUserInfo
): Promise<SafeUser> {
  // Verify email domain
  const emailDomain = googleUser.email.split("@")[1]?.toLowerCase();
  if (!emailDomain || !ALLOWED_GOOGLE_DOMAINS.includes(emailDomain)) {
    throw new Error(
      `Access denied. Only @${ALLOWED_GOOGLE_DOMAINS.join(", @")} accounts are allowed.`
    );
  }

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { providerId: googleUser.sub, provider: AuthProvider.GOOGLE },
        { email: googleUser.email },
      ],
    },
    include: { role: true },
  });

  if (user) {
    // Update provider info if user exists but was created differently
    if (user.provider !== AuthProvider.GOOGLE || user.providerId !== googleUser.sub) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          provider: AuthProvider.GOOGLE,
          providerId: googleUser.sub,
        },
        include: { role: true },
      });
    }

    if (!user.isActive) {
      throw new Error("User is disabled");
    }

    return toSafeUser(user);
  }

  // Create new user with default role (GUEST)
  const roleId = await getDefaultRoleId();

  user = await prisma.user.create({
    data: {
      email: googleUser.email,
      name: googleUser.name,
      roleId,
      provider: AuthProvider.GOOGLE,
      providerId: googleUser.sub,
      passwordHash: null, // Google users don't have a password
    },
    include: { role: true },
  });

  return toSafeUser(user);
}

export async function getUserById(id: string): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!user) return null;

  return toSafeUser(user);
}

export { getDefaultRoleId };

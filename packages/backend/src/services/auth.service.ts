import { prisma, type User, type Role, AuthProvider } from "@go-watchtower/database";
import { hashPassword, verifyPassword } from "../utils/password.js";

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

// User without password hash, with role name from join
export type SafeUser = Omit<User, "passwordHash"> & { roleName: string };

type UserWithRole = User & { role: Role };

function toSafeUser(user: UserWithRole): SafeUser {
  const { passwordHash: _, role, ...rest } = user;
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

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid credentials");
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

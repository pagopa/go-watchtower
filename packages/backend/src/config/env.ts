import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const env = {
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  PORT: parseInt(optionalEnv("PORT", "3001"), 10),
  HOST: optionalEnv("HOST", "0.0.0.0"),

  // JWT - Access token (short-lived)
  JWT_SECRET: requireEnv("JWT_SECRET"),
  ACCESS_TOKEN_EXPIRES_IN: optionalEnv("ACCESS_TOKEN_EXPIRES_IN", "15m"),

  // Refresh token (long-lived, stored in DB)
  REFRESH_TOKEN_EXPIRES_DAYS: parseInt(
    optionalEnv("REFRESH_TOKEN_EXPIRES_DAYS", "7"),
    10
  ),

  // Google OAuth
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
  GOOGLE_CALLBACK_URL: optionalEnv(
    "GOOGLE_CALLBACK_URL",
    "http://localhost:3001/auth/google/callback"
  ),

  // Frontend URL (for redirects)
  FRONTEND_URL: optionalEnv("FRONTEND_URL", "http://localhost:3000"),

  // Security
  COOKIE_SECURE: optionalEnv("COOKIE_SECURE", "false") === "true",
  COOKIE_SAME_SITE: optionalEnv("COOKIE_SAME_SITE", "lax") as
    | "strict"
    | "lax"
    | "none",
} as const;

export type Env = typeof env;

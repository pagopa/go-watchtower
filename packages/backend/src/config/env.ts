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

function optionalPositiveIntEnv(name: string, defaultValue: number): number {
  const value = process.env[name]?.trim();
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer environment variable: ${name}`);
  }

  return parsed;
}

export const env = {
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  PORT: optionalPositiveIntEnv("PORT", 3001),
  HOST: optionalEnv("HOST", "0.0.0.0"),

  // JWT - Access token (short-lived)
  JWT_SECRET: requireEnv("JWT_SECRET"),
  COOKIE_SECRET: optionalEnv("COOKIE_SECRET", ""),
  ACCESS_TOKEN_EXPIRES_IN: optionalEnv("ACCESS_TOKEN_EXPIRES_IN", "15m"),

  // Refresh token (long-lived, stored in DB)
  REFRESH_TOKEN_EXPIRES_DAYS: optionalPositiveIntEnv(
    "REFRESH_TOKEN_EXPIRES_DAYS",
    7
  ),
  REFRESH_TOKEN_ROTATION_GRACE_SECONDS: optionalPositiveIntEnv(
    "REFRESH_TOKEN_ROTATION_GRACE_SECONDS",
    300
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

  // Runbook Automation — reconciler/reaper/safety-net/finalizer + dispatch (OPUS-03 §9.9)
  // Opt-in: invia messaggi verso SQS, quindi va abilitato esplicitamente.
  RECONCILER_ENABLED: optionalEnv("RECONCILER_ENABLED", "false") === "true",
  RECONCILER_INTERVAL_MS: optionalPositiveIntEnv("RECONCILER_INTERVAL_MS", 60_000),
  // Registry regionale GA→WT (contratto §6). Se vuoto → reconciler in sola modalità DB
  // (nessun dispatch su SQS), il resto (timeout/recupero/finalizzazione) gira comunque.
  EXECUTE_RUNBOOK_QUEUE_REGISTRY_PARAMETER: optionalEnv("EXECUTE_RUNBOOK_QUEUE_REGISTRY_PARAMETER", ""),
  EXECUTE_RUNBOOK_QUEUE_REGISTRY_REGION: optionalEnv("EXECUTE_RUNBOOK_QUEUE_REGISTRY_REGION", "eu-south-1"),
} as const;

export type Env = typeof env;

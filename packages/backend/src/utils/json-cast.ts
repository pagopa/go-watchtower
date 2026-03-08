import type { Prisma } from "@go-watchtower/database";

/**
 * Type-safe helpers for Prisma JSON fields.
 *
 * Prisma stores JSON columns as `Prisma.JsonValue` (read) and requires
 * `Prisma.InputJsonValue` (write). These helpers avoid scattered
 * `as unknown as Prisma.InputJsonValue` casts throughout the codebase.
 */

/** Cast a typed value to Prisma.InputJsonValue for DB writes. */
export function toJsonInput<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Cast a Prisma.JsonValue to a typed value for DB reads. */
export function fromJson<T>(value: Prisma.JsonValue | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return value as T;
}

/** Cast a Prisma.JsonValue to a typed value with a default for DB reads. */
export function fromJsonOr<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return value as T;
}

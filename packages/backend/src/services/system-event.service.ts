import type { SystemEventAction, SystemEventResource } from "@go-watchtower/shared";
import { prisma, Prisma } from "@go-watchtower/database";

/**
 * Fire-and-forget audit log writer.
 * Synchronous signature: the caller is never blocked by the DB write.
 * Errors are silently logged to stderr so they never bubble up to the
 * HTTP response.
 */
/**
 * Builds a diff object with only the fields that changed between `before`
 * and `after`. Each changed field is represented as `{ before, after }`.
 * Pass `fields` to restrict which keys are compared.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): Record<string, { before: unknown; after: unknown }> {
  const keys = fields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    // Use JSON comparison to handle object/array values
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { before: b, after: a };
    }
  }
  return diff;
}

export function logEvent(params: {
  action: SystemEventAction;
  resource?: SystemEventResource;
  resourceId?: string | null;
  resourceLabel?: string | null;
  userId?: string | null;
  userLabel?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): void {
  prisma.systemEvent
    .create({
      data: {
        action: params.action,
        resource: params.resource ?? null,
        resourceId: params.resourceId ?? null,
        resourceLabel: params.resourceLabel ?? null,
        userId: params.userId ?? null,
        userLabel: params.userLabel ?? null,
        metadata: (params.metadata ?? {}) as unknown as Prisma.InputJsonValue,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[system-event] Failed to persist audit event:", err);
    });
}

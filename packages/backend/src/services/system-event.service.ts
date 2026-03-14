import type { SystemEventAction, SystemEventResource } from "@go-watchtower/shared";
import { buildDiff } from "@go-watchtower/shared";
import { prisma, Prisma } from "@go-watchtower/database";

export { buildDiff };

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
      console.error("[system-event] Failed to persist audit event:", err);
    });
}

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { ErrorResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema };

// ─── Query ───────────────────────────────────────────────────────────────────

export const SystemEventsQuerySchema = Type.Object({
  action: Type.Optional(Type.Array(Type.String())),
  resource: Type.Optional(Type.String()),
  resourceId: Type.Optional(Type.String()),
  userId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  sortBy: Type.Optional(
    Type.Union([
      Type.Literal("createdAt"),
      Type.Literal("action"),
      Type.Literal("resource"),
      Type.Literal("userLabel"),
    ])
  ),
  sortOrder: Type.Optional(
    Type.Union([Type.Literal("asc"), Type.Literal("desc")])
  ),
});

export type SystemEventsQuery = Static<typeof SystemEventsQuerySchema>;

// ─── Response items ──────────────────────────────────────────────────────────

export const SystemEventSchema = Type.Object({
  id: Type.String(),
  action: Type.String(),
  resource: Type.Union([Type.String(), Type.Null()]),
  resourceId: Type.Union([Type.String(), Type.Null()]),
  resourceLabel: Type.Union([Type.String(), Type.Null()]),
  userId: Type.Union([Type.String(), Type.Null()]),
  userLabel: Type.Union([Type.String(), Type.Null()]),
  metadata: Type.Unknown(),
  ipAddress: Type.Union([Type.String(), Type.Null()]),
  userAgent: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String(),
});

export const SystemEventsResponseSchema = Type.Object({
  data: Type.Array(SystemEventSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  totalPages: Type.Integer(),
});

export type SystemEventsResponse = Static<typeof SystemEventsResponseSchema>;


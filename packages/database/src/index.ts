export { prisma } from "./client.js";
export type { PrismaClient } from "./client.js";

// Re-export Prisma namespace (for DbNull, JsonNull, etc.)
export { Prisma } from "../generated/prisma/client.js";

// Re-export generated Prisma types
export {
  AuthProvider,
  AnalysisType,
  AnalysisStatus,
  SystemComponent,
  PermissionScope,
  RunbookStatus,
  type User,
  type Role,
  type RolePermission,
  type UserPermissionOverride,
  type RefreshToken,
  type Product,
  type Environment,
  type Resource,
  type Alarm,
  type IgnoredAlarm,
  type Runbook,
  type FinalAction,
  type AlarmAnalysis,
  type AnalysisResource,
  type Downstream,
  type AnalysisDownstream,
  type SystemSetting,
  type SystemEvent,
} from "../generated/prisma/client.js";

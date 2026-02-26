export { prisma } from "./client.js";
export type { PrismaClient } from "./client.js";

// Re-export generated Prisma types
export {
  AuthProvider,
  AnalysisType,
  AnalysisStatus,
  Resource,
  type User,
  type Role,
  type RolePermission,
  type UserPermissionOverride,
  type RefreshToken,
  type Product,
  type Environment,
  type Microservice,
  type Alarm,
  type IgnoredAlarm,
  type Runbook,
  type FinalAction,
  type AlarmAnalysis,
  type AnalysisMicroservice,
  type Downstream,
  type AnalysisDownstream,
} from "../generated/prisma/client.js";

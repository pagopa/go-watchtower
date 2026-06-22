export { prisma } from "./client.js";
export type { PrismaClient } from "./client.js";

// Runbook Automation — Flow 1 outbox primitives (shared by backend + slack-ingestor)
export { ensureInitialExecution, markQueued } from "./runbook-automation.js";
export type { EnsureInitialExecutionResult, MarkQueuedResult } from "./runbook-automation.js";

// Re-export Prisma namespace (for DbNull, JsonNull, etc.)
export { Prisma } from "../generated/prisma/client.js";

// Re-export generated Prisma types
export {
  AuthProvider,
  AnalysisType,
  AnalysisStatus,
  AlarmPriorityMatcherType,
  SystemComponent,
  PermissionScope,
  RunbookStatus,
  PrincipalType,
  AnalysisOrigin,
  AutomationExecutionStatus,
  AutomationExecutionOutcome,
  AutomationTriggerKind,
  AutomationReviewStatus,
  AutomationMode,
  AutomationAttemptStatus,
  AutomationRetryDisposition,
  AutomationCancellationFinalizedBy,
  type User,
  type Role,
  type RolePermission,
  type UserPermissionOverride,
  type RefreshToken,
  type Product,
  type Environment,
  type Resource,
  type ResourceType,
  type Alarm,
  type IgnoredAlarm,
  type PriorityLevel,
  type AlarmPriorityRule,
  type Runbook,
  type FinalAction,
  type AlarmAnalysis,
  type AnalysisResource,
  type Downstream,
  type AnalysisDownstream,
  type SystemSetting,
  type SystemEvent,
  type AutomaticRunbookExecution,
  type AutomaticRunbookAttempt,
} from "../generated/prisma/client.js";

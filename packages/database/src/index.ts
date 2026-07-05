export { prisma } from "./client.js";
export type { PrismaClient } from "./client.js";

// Runbook Automation — Flow 1 outbox primitives (shared by backend + slack-ingestor)
export { ensureInitialExecution, markQueued } from "./runbook-automation.js";
export type {
  EnsureInitialExecutionResult,
  InitialExecutionCapability,
  MarkQueuedResult,
} from "./runbook-automation.js";

export {
  getActiveCapabilityCatalog,
  upsertVerifiedCapabilityCatalog,
  renewCapabilityCatalogVerification,
  recordCapabilityCatalogFailure,
  withCapabilityCatalogSyncLock,
} from "./automation-capability-catalog.js";
export type {
  ActiveCapabilityCatalog,
  VerifiedCapabilityCatalogInput,
  CapabilityCatalogFailureInput,
  CapabilityCatalogSyncLockResult,
} from "./automation-capability-catalog.js";

export { createSlackAlarmEventDecision } from "./slack-automation-decision.js";
export type {
  SlackExecutionCapabilityInput,
  SlackExecutionCreateInput,
  CreateSlackAlarmEventDecisionInput,
  CreateSlackAlarmEventDecisionResult,
} from "./slack-automation-decision.js";

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
  AutomationDispatchKind,
  AutomationReviewStatus,
  AutomationMode,
  AutomationAttemptStatus,
  AutomationRetryDisposition,
  AutomationCancellationFinalizedBy,
  SlackAutomationDecision,
  RefreshTokenSource,
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
  type AutomationCapabilityCatalog,
  type AlarmEvent,
  type SlackChannelCursor,
} from "../generated/prisma/client.js";

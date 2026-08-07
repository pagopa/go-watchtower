// Costanti di dominio per l'integrazione Runbook Automation ⇄ Watchtower.
// Fonte normativa: EVO-WATCHTINTEG-OPUS-03.md (§9.4) + EVO-WATCHINTEG-CONTRACT-03.md.
// I valori rispecchiano gli enum Prisma per coerenza cross-package; le literal
// sono esplicite per preservare l'inferenza statica.

// ─── Principal type (D4/A1) ──────────────────────────────────────────────────

export const PrincipalTypes = {
  HUMAN: "HUMAN",
  SERVICE: "SERVICE",
} as const;

export type PrincipalType =
  (typeof PrincipalTypes)[keyof typeof PrincipalTypes];

export const PRINCIPAL_TYPE_VALUES = Object.values(PrincipalTypes) as [
  PrincipalType,
  ...PrincipalType[],
];

/**
 * Identità tecnica del worker Runbook Automation.
 * Audience/issuer/serviceId sono normativi (contratto §4.4).
 */
export const RUNBOOK_AUTOMATION_SERVICE_ID = "runbook-automation-worker";
export const RUNBOOK_AUTOMATION_AUDIENCE = "watchtower-automation";
export const RUNBOOK_AUTOMATION_ISSUER = "go-watchtower";

// ─── Analysis origin (§9.2) ──────────────────────────────────────────────────

export const AnalysisOrigins = {
  MANUAL: "MANUAL",
  AUTOMATIC: "AUTOMATIC",
  HYBRID: "HYBRID",
} as const;

export type AnalysisOrigin =
  (typeof AnalysisOrigins)[keyof typeof AnalysisOrigins];

export const ANALYSIS_ORIGIN_VALUES = Object.values(AnalysisOrigins) as [
  AnalysisOrigin,
  ...AnalysisOrigin[],
];

// ─── Execution status (state machine §12) ────────────────────────────────────

export const AutomationExecutionStatuses = {
  PENDING_DISPATCH: "PENDING_DISPATCH",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  RETRY_PENDING: "RETRY_PENDING",
  CANCEL_REQUESTED: "CANCEL_REQUESTED",
  SUCCEEDED: "SUCCEEDED",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type AutomationExecutionStatus =
  (typeof AutomationExecutionStatuses)[keyof typeof AutomationExecutionStatuses];

export const AUTOMATION_EXECUTION_STATUS_VALUES = Object.values(
  AutomationExecutionStatuses,
) as [AutomationExecutionStatus, ...AutomationExecutionStatus[]];

/** Stati terminali: ogni execution converge eventualmente qui (contratto §8.1). */
export const TERMINAL_EXECUTION_STATUSES: readonly AutomationExecutionStatus[] =
  [
    AutomationExecutionStatuses.SUCCEEDED,
    AutomationExecutionStatuses.SKIPPED,
    AutomationExecutionStatuses.FAILED,
    AutomationExecutionStatuses.CANCELLED,
  ];

/** Stati non-terminali da cui una delivery senza lease può acquisire il lease. */
export const RUNNABLE_EXECUTION_STATUSES: readonly AutomationExecutionStatus[] =
  [
    AutomationExecutionStatuses.PENDING_DISPATCH,
    AutomationExecutionStatuses.QUEUED,
    AutomationExecutionStatuses.RETRY_PENDING,
  ];

export function isTerminalExecutionStatus(
  status: AutomationExecutionStatus,
): boolean {
  return TERMINAL_EXECUTION_STATUSES.includes(status);
}

// ─── Execution outcome (matrice §9.1) ─────────────────────────────────────────

export const AutomationExecutionOutcomes = {
  KNOWN_CASE: "KNOWN_CASE",
  UNKNOWN_CASE: "UNKNOWN_CASE",
  NO_DATA: "NO_DATA",
  CAPABILITY_WITHDRAWN: "CAPABILITY_WITHDRAWN",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  EXECUTION_ERROR: "EXECUTION_ERROR",
} as const;

export type AutomationExecutionOutcome =
  (typeof AutomationExecutionOutcomes)[keyof typeof AutomationExecutionOutcomes];

export const AUTOMATION_EXECUTION_OUTCOME_VALUES = Object.values(
  AutomationExecutionOutcomes,
) as [AutomationExecutionOutcome, ...AutomationExecutionOutcome[]];

/**
 * Mappa outcome → status terminale derivato (§9.3 passo 3, "complete non forza mai SUCCEEDED").
 */
export const OUTCOME_TO_STATUS: Readonly<
  Record<AutomationExecutionOutcome, AutomationExecutionStatus>
> = {
  KNOWN_CASE: AutomationExecutionStatuses.SUCCEEDED,
  UNKNOWN_CASE: AutomationExecutionStatuses.SUCCEEDED,
  NO_DATA: AutomationExecutionStatuses.SUCCEEDED,
  CAPABILITY_WITHDRAWN: AutomationExecutionStatuses.SKIPPED,
  CONFIGURATION_ERROR: AutomationExecutionStatuses.FAILED,
  EXECUTION_ERROR: AutomationExecutionStatuses.FAILED,
};

/** Esiti che creano/aggiornano un'AlarmAnalysis (routing 3 rami, §9.2). */
export const ANALYSIS_BEARING_OUTCOMES: readonly AutomationExecutionOutcome[] =
  [
    AutomationExecutionOutcomes.KNOWN_CASE,
    AutomationExecutionOutcomes.UNKNOWN_CASE,
  ];

// ─── Trigger kind (§7.1) ──────────────────────────────────────────────────────

export const AutomationTriggerKinds = {
  SLACK_INGESTOR: "SLACK_INGESTOR",
  WATCHTOWER_UI: "WATCHTOWER_UI",
  WATCHTOWER_API: "WATCHTOWER_API",
  RETRY: "RETRY",
  WATCHTOWER_CLI: "WATCHTOWER_CLI",
} as const;

export type AutomationTriggerKind =
  (typeof AutomationTriggerKinds)[keyof typeof AutomationTriggerKinds];

export const AUTOMATION_TRIGGER_KIND_VALUES = Object.values(
  AutomationTriggerKinds,
) as [AutomationTriggerKind, ...AutomationTriggerKind[]];

// ─── Dispatch kind (§EVO-WATCHCLI-FIN-03) ───────────────────────────────────

export const AutomationDispatchKinds = {
  SQS: "SQS",
  CLI: "CLI",
} as const;

export type AutomationDispatchKind =
  (typeof AutomationDispatchKinds)[keyof typeof AutomationDispatchKinds];

export const AUTOMATION_DISPATCH_KIND_VALUES = Object.values(
  AutomationDispatchKinds,
) as [AutomationDispatchKind, ...AutomationDispatchKind[]];

// ─── Review status (§9.4) ─────────────────────────────────────────────────────

export const AutomationReviewStatuses = {
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  REJECTED: "REJECTED",
} as const;

export type AutomationReviewStatus =
  (typeof AutomationReviewStatuses)[keyof typeof AutomationReviewStatuses];

export const AUTOMATION_REVIEW_STATUS_VALUES = Object.values(
  AutomationReviewStatuses,
) as [AutomationReviewStatus, ...AutomationReviewStatus[]];

// ─── Rollout mode (§9.3) ──────────────────────────────────────────────────────

export const AutomationModes = {
  SHADOW: "SHADOW",
  APPLY_KNOWN: "APPLY_KNOWN",
  APPLY_ALL: "APPLY_ALL",
} as const;

export type AutomationMode =
  (typeof AutomationModes)[keyof typeof AutomationModes];

export const AUTOMATION_MODE_VALUES = Object.values(AutomationModes) as [
  AutomationMode,
  ...AutomationMode[],
];

/** Chiave SystemSetting per il modo di default del rollout (§9.3/OP-11). */
export const AUTOMATION_DEFAULT_MODE_SETTING_KEY = "automation.defaultMode";

// ─── Attempt status (§9.4) ────────────────────────────────────────────────────

export const AutomationAttemptStatuses = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  INTERRUPTED: "INTERRUPTED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type AutomationAttemptStatus =
  (typeof AutomationAttemptStatuses)[keyof typeof AutomationAttemptStatuses];

export const AUTOMATION_ATTEMPT_STATUS_VALUES = Object.values(
  AutomationAttemptStatuses,
) as [AutomationAttemptStatus, ...AutomationAttemptStatus[]];

// ─── Retry disposition (tassonomia §5.4) ──────────────────────────────────────

export const AutomationRetryDispositions = {
  COMPLETE_OUTCOME: "COMPLETE_OUTCOME",
  CANCEL_EXECUTION: "CANCEL_EXECUTION",
  RETRY_MESSAGE: "RETRY_MESSAGE",
  FAIL_EXECUTION: "FAIL_EXECUTION",
} as const;

export type AutomationRetryDisposition =
  (typeof AutomationRetryDispositions)[keyof typeof AutomationRetryDispositions];

export const AUTOMATION_RETRY_DISPOSITION_VALUES = Object.values(
  AutomationRetryDispositions,
) as [AutomationRetryDisposition, ...AutomationRetryDisposition[]];

// ─── Cancellation finalized-by (§9.11) ────────────────────────────────────────

export const AutomationCancellationFinalizedBys = {
  IMMEDIATE: "IMMEDIATE",
  WORKER: "WORKER",
  SYSTEM: "SYSTEM",
} as const;

export type AutomationCancellationFinalizedBy =
  (typeof AutomationCancellationFinalizedBys)[keyof typeof AutomationCancellationFinalizedBys];

export const AUTOMATION_CANCELLATION_FINALIZED_BY_VALUES = Object.values(
  AutomationCancellationFinalizedBys,
) as [
  AutomationCancellationFinalizedBy,
  ...AutomationCancellationFinalizedBy[],
];

// ─── System error codes (§9.4 errorCode) ──────────────────────────────────────

export const AutomationSystemErrorCodes = {
  TIMED_OUT: "TIMED_OUT",
  DEAD_LETTERED: "DEAD_LETTERED",
  DISPATCH_FAILED: "DISPATCH_FAILED",
  QUEUE_DELIVERY_TIMED_OUT: "QUEUE_DELIVERY_TIMED_OUT",
  LOCAL_RUN_TIMED_OUT: "LOCAL_RUN_TIMED_OUT",
  REGION_NOT_ONBOARDED: "REGION_NOT_ONBOARDED",
  QUEUE_REGISTRY_INVALID: "QUEUE_REGISTRY_INVALID",
} as const;

export type AutomationSystemErrorCode =
  (typeof AutomationSystemErrorCodes)[keyof typeof AutomationSystemErrorCodes];

// ─── Fail allowlist (worker → backend, §9.7) ──────────────────────────────────

export const AutomationFailErrorCodes = {
  INVALID_COMMAND: "INVALID_COMMAND",
  UNSUPPORTED_COMMAND_VERSION: "UNSUPPORTED_COMMAND_VERSION",
  RUNBOOK_CAPABILITY_MISMATCH: "RUNBOOK_CAPABILITY_MISMATCH",
  WORKER_CONFIGURATION_ERROR: "WORKER_CONFIGURATION_ERROR",
  INTERNAL_INVARIANT: "INTERNAL_INVARIANT",
  /**
   * Il backend ha respinto un callback del worker con un 4xx permanente (§5.3).
   * Codice dedicato invece di riusare WORKER_CONFIGURATION_ERROR: un rifiuto lato
   * Watchtower non è un problema di configurazione del worker e inquinerebbe
   * metriche e diagnosi.
   */
  WORKER_CALLBACK_REJECTED: "WORKER_CALLBACK_REJECTED",
} as const;

export type AutomationFailErrorCode =
  (typeof AutomationFailErrorCodes)[keyof typeof AutomationFailErrorCodes];

export const AUTOMATION_FAIL_ERROR_CODE_VALUES = Object.values(
  AutomationFailErrorCodes,
) as [AutomationFailErrorCode, ...AutomationFailErrorCode[]];

export const AutomationFailErrorCategories = {
  COMMAND: "COMMAND",
  CAPABILITY: "CAPABILITY",
  WORKER_CONFIGURATION: "WORKER_CONFIGURATION",
  INTERNAL_INVARIANT: "INTERNAL_INVARIANT",
  /** Callback worker → backend respinto in modo permanente (§5.3). */
  CALLBACK: "CALLBACK",
} as const;

export type AutomationFailErrorCategory =
  (typeof AutomationFailErrorCategories)[keyof typeof AutomationFailErrorCategories];

export const AUTOMATION_FAIL_ERROR_CATEGORY_VALUES = Object.values(
  AutomationFailErrorCategories,
) as [AutomationFailErrorCategory, ...AutomationFailErrorCategory[]];

/** Coerenza allowlist errorCode → errorCategory (§9.7 fail). */
export const FAIL_ERROR_CODE_TO_CATEGORY: Readonly<
  Record<AutomationFailErrorCode, AutomationFailErrorCategory>
> = {
  INVALID_COMMAND: AutomationFailErrorCategories.COMMAND,
  UNSUPPORTED_COMMAND_VERSION: AutomationFailErrorCategories.COMMAND,
  RUNBOOK_CAPABILITY_MISMATCH: AutomationFailErrorCategories.CAPABILITY,
  WORKER_CONFIGURATION_ERROR:
    AutomationFailErrorCategories.WORKER_CONFIGURATION,
  INTERNAL_INVARIANT: AutomationFailErrorCategories.INTERNAL_INVARIANT,
  WORKER_CALLBACK_REJECTED: AutomationFailErrorCategories.CALLBACK,
};

// ─── Esito dell'apply dell'analisi automatica (§5.8, §5.9) ───────────────────

export const AutomationAnalysisApplyStatuses = {
  /** Stato iniziale: ogni percorso terminale deve lasciarlo diverso da PENDING. */
  PENDING: "PENDING",
  APPLIED: "APPLIED",
  BLOCKED: "BLOCKED",
  NOT_REQUESTED: "NOT_REQUESTED",
  PRESERVED_HUMAN: "PRESERVED_HUMAN",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;

export type AutomationAnalysisApplyStatus =
  (typeof AutomationAnalysisApplyStatuses)[keyof typeof AutomationAnalysisApplyStatuses];

export const AUTOMATION_ANALYSIS_APPLY_STATUS_VALUES = Object.values(
  AutomationAnalysisApplyStatuses,
) as [AutomationAnalysisApplyStatus, ...AutomationAnalysisApplyStatus[]];

/**
 * Motivi di blocco dell'apply, allowlisted: mai stringhe libere.
 *
 * L'ordine di valutazione è quello della pipeline di materializzazione (§5.6) e
 * `blockCode` è singolo: al primo blocco la pipeline si ferma.
 */
export const AnalysisApplyBlockCodes = {
  DRAFT_TOO_LARGE: "DRAFT_TOO_LARGE",
  MISSING_DRAFT: "MISSING_DRAFT",
  INVALID_DRAFT: "INVALID_DRAFT",
  TEMPORAL_INCOHERENCE: "TEMPORAL_INCOHERENCE",
  UNRESOLVED_REFERENCES: "UNRESOLVED_REFERENCES",
  RESOURCE_TYPE_MISMATCH: "RESOURCE_TYPE_MISMATCH",
  INVALID_IGNORE_DETAILS: "INVALID_IGNORE_DETAILS",
  VALIDATION_ERRORS: "VALIDATION_ERRORS",
} as const;

export type AnalysisApplyBlockCode =
  (typeof AnalysisApplyBlockCodes)[keyof typeof AnalysisApplyBlockCodes];

export const ANALYSIS_APPLY_BLOCK_CODE_VALUES = Object.values(
  AnalysisApplyBlockCodes,
) as [AnalysisApplyBlockCode, ...AnalysisApplyBlockCode[]];

// ─── Versione canonicalizzazione completamento (§9.7, owned-by-backend) ────────

export const WT_COMPLETE_HASH_VERSION = "WT-COMPLETE-SHA256-V1";

// ─── Budget lifecycle (§11.2; valori interi bounded, source of truth unica) ────
// Nota: QUEUE_DELIVERY_BUDGET_MS deriva da SQS_MESSAGE_RETENTION_MS + RECONCILER_MARGIN_MS
// e non è hardcodato qui: il registry GA→WT fornisce messageRetentionSeconds (contratto §6).

export const AutomationLifecycleBudgets = {
  DISPATCH_BUDGET_MS: 900_000, // 15 min
  QUEUE_DELIVERY_SLO_MS: 900_000, // allarme precoce, non terminalizza
  CANCELLATION_HEARTBEAT_INTERVAL_MS: 5_000,
  CANCELLATION_CONTROL_PLANE_GRACE_MS: 20_000,
  REMOTE_CLEANUP_BUDGET_MS: 5_000,
  ATTEMPT_LEASE_MARGIN_MS: 60_000,
  CONFIGURED_LAMBDA_TIMEOUT_MS: 900_000,
  RECONCILER_MARGIN_MS: 60_000,
  CLI_START_GRACE_MS: 120_000,
  CLI_HEARTBEAT_GRACE_MS: 120_000,
  CLI_HEARTBEAT_INTERVAL_MS: 30_000,
} as const;

export type AutomationLifecycleBudgetKey =
  keyof typeof AutomationLifecycleBudgets;

/** Posizione SSM del registry regionale (contratto §6). */
export const EXECUTE_RUNBOOK_QUEUE_REGISTRY_SCHEMA_VERSION = 1;

/** Versione del comando SQS AutomaticAlarmAnalysisCommandV1 (contratto §5, congelata a 1.0.0). */
export const AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION = "1.0.0";

export const CLI_TOKEN_DEFAULT_TTL_DAYS_SETTING_KEY =
  "auth.cliToken.defaultTtlDays";
export const CLI_TOKEN_MAX_TTL_DAYS_SETTING_KEY = "auth.cliToken.maxTtlDays";
export const CLI_TOKEN_HARD_MAX_TTL_DAYS = 90;
export const RUNBOOK_AUTOMATION_CLI_SCOPE = "RUNBOOK_AUTOMATION_CLI";

export const SLACK_INGESTOR_CONTROL_SETTING_KEY = "slackIngestor.control";
export const SLACK_INGESTOR_CONTROL_SCHEMA_VERSION = 1;
export const AUTOMATIC_RUNBOOK_CATALOG_SCHEMA_VERSION = 1;
export const AUTOMATION_CAPABILITY_CATALOG_ACTIVE_KEY = "ACTIVE";

export const SlackIngestorIngestionModes = {
  ENABLED: "ENABLED",
  PAUSED: "PAUSED",
} as const;

export type SlackIngestorIngestionMode =
  (typeof SlackIngestorIngestionModes)[keyof typeof SlackIngestorIngestionModes];

export const SlackIngestorExecutionPolicies = {
  OFF: "OFF",
  AVAILABLE_ONLY: "AVAILABLE_ONLY",
} as const;

export type SlackIngestorExecutionPolicy =
  (typeof SlackIngestorExecutionPolicies)[keyof typeof SlackIngestorExecutionPolicies];

export const SlackIngestorRuleEffects = {
  ALLOW: "ALLOW",
  DENY: "DENY",
} as const;

export type SlackIngestorRuleEffect =
  (typeof SlackIngestorRuleEffects)[keyof typeof SlackIngestorRuleEffects];

export const SlackAutomationDecisions = {
  EXECUTION_CREATED: "EXECUTION_CREATED",
  EXECUTION_POLICY_OFF: "EXECUTION_POLICY_OFF",
  UNLINKED_ALARM: "UNLINKED_ALARM",
  CATALOG_UNAVAILABLE: "CATALOG_UNAVAILABLE",
  NO_CAPABILITY: "NO_CAPABILITY",
  SCOPE_CONFIGURATION_UNSAFE: "SCOPE_CONFIGURATION_UNSAFE",
  SCOPE_DENIED: "SCOPE_DENIED",
  LEGACY_EVENT_NOT_EVALUATED: "LEGACY_EVENT_NOT_EVALUATED",
} as const;

export type SlackAutomationDecision =
  (typeof SlackAutomationDecisions)[keyof typeof SlackAutomationDecisions];

export const AutomaticRunbookKinds = {
  APIGW: "APIGW",
  LAMBDA: "LAMBDA",
  SERVICE: "SERVICE",
} as const;

export type AutomaticRunbookKind =
  (typeof AutomaticRunbookKinds)[keyof typeof AutomaticRunbookKinds];

export const AutomationCatalogHealths = {
  UNINITIALIZED: "UNINITIALIZED",
  INVALID: "INVALID",
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  STALE: "STALE",
} as const;

export type AutomationCatalogHealth =
  (typeof AutomationCatalogHealths)[keyof typeof AutomationCatalogHealths];

export const CatalogReferenceHealths = {
  VALID: "VALID",
  PARTIALLY_UNRESOLVED: "PARTIALLY_UNRESOLVED",
  UNRESOLVED: "UNRESOLVED",
  UNSAFE: "UNSAFE",
} as const;

export type CatalogReferenceHealth =
  (typeof CatalogReferenceHealths)[keyof typeof CatalogReferenceHealths];

export const SLACK_INGESTOR_MAX_RULES = 100;
export const SLACK_INGESTOR_MAX_MATCHER_VALUES = 100;
export const SLACK_INGESTOR_CONTROL_MAX_BYTES = 256 * 1024;
export const QUICK_DENY_PREFIX = "quick-deny:";

// ─── Configurazione canale Slack sull'Environment ─────────────────────────────
// Unica definizione condivisa: usata dal registry dei parser (slack-ingestor),
// dalla validazione backend (route environments) e dalle form/label frontend.

export const SlackParserIds = {
  AMAZON_Q: "amazon-q",
  OPSGENIE: "opsgenie",
  EMAIL_SNS: "email-sns",
  JSM: "jsm",
} as const;

export type SlackParserId = (typeof SlackParserIds)[keyof typeof SlackParserIds];

/** Tupla ordinata dei parser: adatta a z.enum e alle select della UI. */
export const SLACK_PARSER_IDS = [
  SlackParserIds.AMAZON_Q,
  SlackParserIds.OPSGENIE,
  SlackParserIds.EMAIL_SNS,
  SlackParserIds.JSM,
] as const;

/** Channel ID Slack (canali pubblici/privati e DM: C…, G…, D…). */
export const SLACK_CHANNEL_ID_PATTERN = /^[CGD][A-Z0-9]{8,}$/;

/** Account AWS: 12 cifre. */
export const AWS_ACCOUNT_ID_PATTERN = /^\d{12}$/;

/** Regione AWS (es. eu-south-1, us-gov-west-1). */
export const AWS_REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;

import type { AutomationMode } from "../constants/automation.js";
import type {
  AutomaticRunbookKind,
  AutomationCatalogHealth,
  CatalogReferenceHealth,
  SlackIngestorExecutionPolicy,
  SlackIngestorIngestionMode,
  SlackIngestorRuleEffect,
} from "../constants/slack-ingestor-automation.js";

export interface SlackIngestorRuleMatcher {
  channelIds?: string[];
  productIds?: string[];
  environmentIds?: string[];
  alarmIds?: string[];
  alarmNames?: string[];
  runbookKeys?: string[];
  runbookKinds?: AutomaticRunbookKind[];
  runbookCategories?: string[];
  awsRegions?: string[];
  awsAccountIds?: string[];
  priorityCodes?: string[];
}

export interface SlackIngestorAutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  effect: SlackIngestorRuleEffect;
  matcher: SlackIngestorRuleMatcher;
}

export interface SlackIngestorControl {
  schemaVersion: 1;
  revision: number;
  ingestionMode: SlackIngestorIngestionMode;
  executionPolicy: SlackIngestorExecutionPolicy;
  defaultRuleEffect: SlackIngestorRuleEffect;
  rules: SlackIngestorAutomationRule[];
}

export interface AutomaticRunbookDescriptor {
  key: string;
  version: string;
  name: string;
  description: string;
  team: string;
  kind: AutomaticRunbookKind;
  categories: string[];
  tags: string[];
  alarmNames: string[];
  definitionDigest: string;
}

export interface AutomaticRunbookCatalog {
  schemaVersion: 1;
  revision: string;
  publishedAt: string;
  environment: string;
  worker: {
    artifactRevision: string;
    commandSchemaVersion: string;
  };
  release: {
    actorArn: string;
    changeNote: string;
  };
  runbooks: AutomaticRunbookDescriptor[];
}

export interface SlackIngestorRuleContext {
  channelId: string;
  productId: string;
  environmentId: string;
  alarmId?: string;
  alarmName: string;
  awsRegion: string;
  awsAccountId: string;
  priorityCode: string;
  runbook: AutomaticRunbookDescriptor;
}

export interface SlackIngestorScopeEvaluation {
  effect: SlackIngestorRuleEffect;
  matchedRuleId: string | null;
}

export interface SlackAutomationDecisionMetadata {
  schemaVersion: 1;
  controlRevision: number;
  executionPolicy: SlackIngestorExecutionPolicy;
  appliedMode?: AutomationMode;
  matchedRuleId?: string;
  ruleEffect?: SlackIngestorRuleEffect;
  catalogRevision?: string;
  runbook?: {
    key: string;
    version: string;
    definitionDigest: string;
    kind: AutomaticRunbookKind;
    categories: string[];
    workerRevision: string;
  };
  executionId?: string;
  reasonDetail?: string;
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { valid: true; value: T; errors: []; warnings: ValidationIssue[] }
  | { valid: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

export interface CatalogReferenceIssue extends ValidationIssue {
  ruleId: string;
  dimension: "runbookKeys" | "runbookKinds" | "runbookCategories";
  values: string[];
}

export interface CatalogReferenceHealthResult {
  health: CatalogReferenceHealth;
  issues: CatalogReferenceIssue[];
  unsafe: boolean;
}

export interface AutomationCapabilityCatalogHealthInput {
  revision: string | null;
  payload: unknown;
  lastAttemptAt: Date | string | null;
  lastVerifiedAt: Date | string | null;
  validUntil: Date | string | null;
  lastErrorCode: string | null;
}

export interface AutomationCapabilityCatalogHealthResult {
  health: AutomationCatalogHealth;
  usable: boolean;
}

/**
 * Thin backend adapter over the single domain authority in @go-watchtower/shared.
 * Persistence and HTTP concerns stay in the backend; validation/evaluation and
 * deterministic quick-rule construction do not have a second implementation.
 */
import {
  SLACK_INGESTOR_CONTROL_SETTING_KEY,
  QUICK_DENY_PREFIX,
  DEFAULT_SLACK_INGESTOR_CONTROL,
  validateSlackIngestorControl,
  evaluateSlackIngestorScope,
  evaluateCatalogReferenceHealth,
  quickRunbookExclusionId,
  quickAlarmExclusionId,
  buildRunbookQuickExclusion,
  buildAlarmQuickExclusion,
  addQuickExclusion,
  removeQuickExclusion,
  buildOnlyRunbookPreset,
  buildOnlyAlarmPreset,
  type SlackIngestorControl,
  type SlackIngestorAutomationRule,
  type SlackIngestorRuleMatcher,
  type SlackIngestorRuleContext,
  type AutomaticRunbookDescriptor,
} from "@go-watchtower/shared";

export { QUICK_DENY_PREFIX, DEFAULT_SLACK_INGESTOR_CONTROL };
export type { SlackIngestorControl, SlackIngestorAutomationRule, SlackIngestorRuleMatcher };
export type RunbookDescriptor = AutomaticRunbookDescriptor;
export type ScopeContext = SlackIngestorRuleContext;
export type IngestionMode = SlackIngestorControl["ingestionMode"];
export type ExecutionPolicy = SlackIngestorControl["executionPolicy"];
export type RuleEffect = SlackIngestorControl["defaultRuleEffect"];
export const SLACK_INGESTOR_CONTROL_KEY = SLACK_INGESTOR_CONTROL_SETTING_KEY;

export function parseControl(value: unknown): SlackIngestorControl | null {
  const result = validateSlackIngestorControl(value, { allowGlobalMatchers: true });
  return result.valid ? result.value : null;
}

export function validateControl(value: unknown, catalog: readonly AutomaticRunbookDescriptor[] = [], allowGlobalMatchers = false) {
  const structural = validateSlackIngestorControl(value, { allowGlobalMatchers });
  if (!structural.valid) {
    return { valid: false, errors: structural.errors, warnings: structural.warnings, catalogReferenceHealth: "VALID" as const };
  }
  const references = evaluateCatalogReferenceHealth(structural.value, catalog);
  const unsafeActivated = references.unsafe && structural.value.executionPolicy === "AVAILABLE_ONLY";
  return {
    valid: !unsafeActivated,
    errors: unsafeActivated ? [{ code: "UNSAFE_CONTROL_REQUIRES_EXECUTION_POLICY_OFF", path: "executionPolicy", message: "Una configurazione UNSAFE richiede executionPolicy OFF." }] : [],
    warnings: [...structural.warnings, ...references.issues],
    catalogReferenceHealth: references.health,
  };
}

export const quickRunbookRuleId = quickRunbookExclusionId;
export const quickAlarmRuleId = quickAlarmExclusionId;

export function withQuickExclusion(
  control: SlackIngestorControl,
  target: { kind: "runbook"; key: string } | { kind: "alarm"; alarmId: string; alarmName?: string },
): SlackIngestorControl {
  const rule = target.kind === "runbook"
    ? buildRunbookQuickExclusion(target.key)
    : buildAlarmQuickExclusion(target.alarmId, target.alarmName);
  return addQuickExclusion(control, rule).control;
}

export function withoutQuickExclusion(control: SlackIngestorControl, id: string): SlackIngestorControl {
  return removeQuickExclusion(control, id).control;
}

export function onlyPreset(
  control: SlackIngestorControl,
  target: { kind: "runbook"; key: string } | { kind: "alarm"; alarmId: string },
): SlackIngestorControl {
  return target.kind === "runbook"
    ? buildOnlyRunbookPreset(control, target.key)
    : buildOnlyAlarmPreset(control, target.alarmId);
}

export function evaluateScope(control: SlackIngestorControl, context: SlackIngestorRuleContext) {
  const result = evaluateSlackIngestorScope(control, context);
  return { effect: result.effect, ruleId: result.matchedRuleId };
}

export function findCapabilityForAlarm(catalog: readonly AutomaticRunbookDescriptor[], alarmName: string): AutomaticRunbookDescriptor | null {
  const matches = catalog.filter((descriptor) => descriptor.alarmNames.includes(alarmName));
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new Error(`AMBIGUOUS_CAPABILITY:${alarmName}`);
  return matches[0]!;
}

import {
  SlackAutomationDecisions,
  SlackIngestorExecutionPolicies,
  evaluateSlackIngestorScope,
  type AutomaticRunbookDescriptor,
  type SlackAutomationDecision,
  type SlackIngestorControl,
  type SlackIngestorRuleContext,
  type SlackIngestorRuleEffect,
} from "@go-watchtower/shared";

export interface AutomationDecisionResult {
  decision: SlackAutomationDecision;
  matchedRuleId?: string;
  ruleEffect?: SlackIngestorRuleEffect;
}

export function decideSlackAutomation(input: {
  control: SlackIngestorControl;
  alarmId: string | null;
  catalogUsable: boolean;
  scopeUnsafe: boolean;
  capability: AutomaticRunbookDescriptor | null;
  context?: Omit<SlackIngestorRuleContext, "runbook" | "alarmId">;
}): AutomationDecisionResult {
  if (input.control.executionPolicy === SlackIngestorExecutionPolicies.OFF) return { decision: SlackAutomationDecisions.EXECUTION_POLICY_OFF };
  if (!input.alarmId) return { decision: SlackAutomationDecisions.UNLINKED_ALARM };
  if (!input.catalogUsable) return { decision: SlackAutomationDecisions.CATALOG_UNAVAILABLE };
  if (input.scopeUnsafe) return { decision: SlackAutomationDecisions.SCOPE_CONFIGURATION_UNSAFE };
  if (!input.capability) return { decision: SlackAutomationDecisions.NO_CAPABILITY };
  if (!input.context) throw new Error("scope context is required for an available capability");
  const scope = evaluateSlackIngestorScope(input.control, { ...input.context, alarmId: input.alarmId, runbook: input.capability });
  return {
    decision: scope.effect === "ALLOW" ? SlackAutomationDecisions.EXECUTION_CREATED : SlackAutomationDecisions.SCOPE_DENIED,
    ...(scope.matchedRuleId ? { matchedRuleId: scope.matchedRuleId } : {}),
    ruleEffect: scope.effect,
  };
}

/**
 * Rules that do not apply to automatically generated analyses.
 *
 * They were written for the initial data import and as reminders for the operator
 * ("do not forget to fill X in"). For an analysis produced mechanically the
 * reminder is meaningless: the automation pre-populates what it knows and the
 * operator confirms. Only intrinsic-correctness rules stay active.
 *
 * Single source of truth for every scoring point — materializer, `scoreAnalysis`
 * and the `rescore-analyses` script — so the same subject always scores the same.
 */
export const AUTOMATION_EXEMPT_RULE_IDS: ReadonlySet<string> = new Set([
  // Validity — reminders, not intrinsic correctness.
  "ANALYZABLE_REQUIRES_FINAL_ACTION",
  "ANALYZABLE_REQUIRES_RESOURCE",
  "MTTA_UNREALISTIC",
  "HIGH_OCCURRENCES_WITHOUT_DOWNSTREAM",
  "DOUBT_ACTION_REQUIRES_NOTES_AND_LINK",
  "ESCALATION_REQUIRES_NOTES",
  "TRACKING_ERROR_CODE",
  "TRACKING_ERROR_DETAIL",
  "DUPLICATE_TRACKING_ERROR_CODE",
  // Quality — the automation cannot be blamed for what the runbook does not know.
  "QUALITY_RUNBOOK_LINKED",
  "QUALITY_ERROR_DETAILS",
  "QUALITY_DOWNSTREAMS",
]);

import type { SlackIngestorAutomationRule } from '@/lib/api-client'

/**
 * Predicati sulle regole di scope.
 *
 * Vivono fuori da `rule-editor.tsx` perché un file che esporta anche non
 * componenti impedisce a Fast Refresh di preservare lo stato dell'editor.
 */

const QUICK_DENY_PREFIX = 'quick-deny:'

/** Regola generata dalle azioni rapide del catalogo (non editabile a mano). */
export function isQuickRule(rule: SlackIngestorAutomationRule): boolean {
  return rule.id.startsWith(QUICK_DENY_PREFIX)
}

/** Regola senza alcuna condizione: si applica a tutto ciò che arriva. */
export function isGlobalRule(rule: SlackIngestorAutomationRule): boolean {
  return Object.values(rule.matcher).every((values) => !values || values.length === 0)
}

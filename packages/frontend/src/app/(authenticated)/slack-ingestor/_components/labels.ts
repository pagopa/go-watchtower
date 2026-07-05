import type {
  SlackIngestorIngestionMode,
  SlackIngestorExecutionPolicy,
  SlackIngestorRuleEffect,
  SlackIngestorRuleMatcher,
  CatalogReferenceHealth,
  AutomaticRunbookCatalogHealth,
} from '@/lib/api-client'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success'

export interface OptionMeta {
  label: string
  description: string
}

// ─── Controlli globali ────────────────────────────────────────────────────────

export const INGESTION_MODE_META: Record<SlackIngestorIngestionMode, OptionMeta & { variant: BadgeVariant }> = {
  ENABLED: {
    label: 'Attiva',
    description: 'I nuovi messaggi Slack vengono importati come eventi allarme.',
    variant: 'success',
  },
  PAUSED: {
    label: 'In pausa',
    description: 'L’importazione è ferma. I cursori Slack non avanzano: alla ripresa nessun messaggio va perso.',
    variant: 'secondary',
  },
}

export const EXECUTION_POLICY_META: Record<SlackIngestorExecutionPolicy, OptionMeta & { variant: BadgeVariant }> = {
  OFF: {
    label: 'Disattivata',
    description: 'Gli allarmi vengono importati ma nessuna execution automatica viene creata.',
    variant: 'secondary',
  },
  AVAILABLE_ONLY: {
    label: 'Solo runbook disponibili',
    description: 'Crea una execution quando l’allarme ha un runbook automatico nel catalogo e le regole lo consentono.',
    variant: 'success',
  },
}

export const RULE_EFFECT_META: Record<SlackIngestorRuleEffect, OptionMeta & { variant: BadgeVariant }> = {
  ALLOW: {
    label: 'Consenti',
    description: 'Gli eventi che corrispondono a questa regola creano una execution automatica.',
    variant: 'success',
  },
  DENY: {
    label: 'Blocca',
    description: 'Gli eventi che corrispondono a questa regola non creano execution automatiche.',
    variant: 'destructive',
  },
}

export const DEFAULT_EFFECT_META: Record<SlackIngestorRuleEffect, OptionMeta> = {
  ALLOW: {
    label: 'Consenti',
    description: 'Gli eventi non intercettati da alcuna regola creano una execution automatica.',
  },
  DENY: {
    label: 'Blocca',
    description: 'Gli eventi non intercettati da alcuna regola non creano execution automatiche (impostazione prudente).',
  },
}

// ─── Salute catalogo e riferimenti ────────────────────────────────────────────

export const CATALOG_HEALTH_META: Record<AutomaticRunbookCatalogHealth, { label: string; variant: BadgeVariant }> = {
  HEALTHY: { label: 'Integro', variant: 'success' },
  DEGRADED: { label: 'Degradato', variant: 'secondary' },
  STALE: { label: 'Obsoleto', variant: 'destructive' },
  INVALID: { label: 'Non valido', variant: 'destructive' },
  UNINITIALIZED: { label: 'Non inizializzato', variant: 'outline' },
}

export const REFERENCE_HEALTH_META: Record<CatalogReferenceHealth | 'INVALID', { label: string; variant: BadgeVariant }> = {
  VALID: { label: 'Validi', variant: 'success' },
  PARTIALLY_UNRESOLVED: { label: 'Parzialmente irrisolti', variant: 'secondary' },
  UNRESOLVED: { label: 'Irrisolti', variant: 'secondary' },
  UNSAFE: { label: 'Non sicuri', variant: 'destructive' },
  INVALID: { label: 'Non validi', variant: 'destructive' },
}

export function catalogHealthMeta(health: string | null | undefined): { label: string; variant: BadgeVariant } {
  if (health && health in CATALOG_HEALTH_META) return CATALOG_HEALTH_META[health as AutomaticRunbookCatalogHealth]
  return { label: health ?? '—', variant: 'outline' }
}

export function referenceHealthMeta(health: string | null | undefined): { label: string; variant: BadgeVariant } {
  if (health && health in REFERENCE_HEALTH_META) return REFERENCE_HEALTH_META[health as CatalogReferenceHealth]
  return { label: health ?? '—', variant: 'outline' }
}

// ─── Decisioni di automazione (overview + anteprima impatto) ──────────────────

export const DECISION_META: Record<string, { label: string; dot: string }> = {
  EXECUTION_CREATED: { label: 'Execution creata', dot: 'bg-emerald-500' },
  EXECUTION_POLICY_OFF: { label: 'Policy disattivata', dot: 'bg-zinc-400' },
  UNLINKED_ALARM: { label: 'Allarme non censito', dot: 'bg-amber-400' },
  CATALOG_UNAVAILABLE: { label: 'Catalogo non disponibile', dot: 'bg-rose-500' },
  NO_CAPABILITY: { label: 'Nessun runbook automatico', dot: 'bg-zinc-400' },
  SCOPE_CONFIGURATION_UNSAFE: { label: 'Configurazione non sicura', dot: 'bg-rose-500' },
  SCOPE_DENIED: { label: 'Bloccato dalle regole', dot: 'bg-orange-500' },
  LEGACY_EVENT_NOT_EVALUATED: { label: 'Evento precedente (non valutato)', dot: 'bg-zinc-300' },
}

export function decisionMeta(decision: string | null): { label: string; dot: string } {
  if (decision && decision in DECISION_META) return DECISION_META[decision]
  return { label: decision ?? 'Non valutato', dot: 'bg-zinc-300' }
}

// ─── Runbook ──────────────────────────────────────────────────────────────────

export const RUNBOOK_KIND_META: Record<string, OptionMeta> = {
  APIGW: { label: 'API Gateway', description: 'Runbook che analizzano allarmi di API Gateway.' },
  LAMBDA: { label: 'Lambda', description: 'Runbook che analizzano allarmi di funzioni Lambda.' },
  SERVICE: { label: 'Servizio', description: 'Runbook che analizzano allarmi di servizi applicativi.' },
}

export function runbookKindLabel(kind: string): string {
  return RUNBOOK_KIND_META[kind]?.label ?? kind
}

// ─── Canali ───────────────────────────────────────────────────────────────────

// Definizione unica in shared (ids, label e descrizioni), ri-esportata per i
// componenti della sezione con i nomi già in uso.
export { SLACK_PARSER_IDS, SLACK_PARSER_LABELS as PARSER_META } from '@go-watchtower/shared'
export type { SlackParserId } from '@go-watchtower/shared'

export const CURSOR_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  SUCCESS: { label: 'Operativo', variant: 'success' },
  FAILED: { label: 'Errore', variant: 'destructive' },
}

export function cursorStatusMeta(status: string | null | undefined): { label: string; variant: BadgeVariant } {
  if (status && status in CURSOR_STATUS_META) return CURSOR_STATUS_META[status]
  return { label: status ?? 'Mai eseguito', variant: 'outline' }
}

export const ROUTING_STATUS_META: Record<string, string> = {
  OK: 'Coda SQS risolta',
  REGION_NOT_ONBOARDED: 'Regione non abilitata al dispatch',
  QUEUE_REGISTRY_INVALID: 'Queue registry non valido',
  QUEUE_REGISTRY_NOT_CONFIGURED: 'Queue registry non configurato',
  REGION_NOT_CONFIGURED: 'Regione non configurata',
  TRANSIENT: 'Errore temporaneo di routing',
  UNKNOWN: 'Routing sconosciuto',
}

export function routingStatusLabel(status: string): string {
  return ROUTING_STATUS_META[status] ?? status
}

// ─── Dimensioni del matcher delle regole ──────────────────────────────────────

export type MatcherDimension = keyof SlackIngestorRuleMatcher

export const MATCHER_DIMENSIONS: readonly MatcherDimension[] = [
  'productIds',
  'environmentIds',
  'alarmIds',
  'alarmNames',
  'channelIds',
  'runbookKeys',
  'runbookKinds',
  'runbookCategories',
  'awsRegions',
  'awsAccountIds',
  'priorityCodes',
] as const

export const DIMENSION_META: Record<MatcherDimension, OptionMeta> = {
  productIds: {
    label: 'Prodotto',
    description: 'Limita la regola agli allarmi di specifici prodotti.',
  },
  environmentIds: {
    label: 'Ambiente',
    description: 'Limita la regola a specifici ambienti (prod, uat, …).',
  },
  alarmIds: {
    label: 'Allarme censito',
    description: 'Specifici allarmi censiti in Watchtower.',
  },
  alarmNames: {
    label: 'Nome allarme',
    description: 'Nomi CloudWatch esatti, anche di allarmi non censiti.',
  },
  channelIds: {
    label: 'Canale Slack',
    description: 'ID dei canali Slack da cui proviene l’evento.',
  },
  runbookKeys: {
    label: 'Runbook',
    description: 'Specifici runbook automatici del catalogo.',
  },
  runbookKinds: {
    label: 'Tipo runbook',
    description: 'Famiglia del runbook: API Gateway, Lambda o Servizio.',
  },
  runbookCategories: {
    label: 'Categoria runbook',
    description: 'Categorie dichiarate dai runbook nel catalogo.',
  },
  awsRegions: {
    label: 'Regione AWS',
    description: 'Regioni AWS dell’evento (es. eu-south-1).',
  },
  awsAccountIds: {
    label: 'Account AWS',
    description: 'ID numerici degli account AWS dell’evento.',
  },
  priorityCodes: {
    label: 'Priorità',
    description: 'Codici di priorità assegnati all’evento allarme.',
  },
}

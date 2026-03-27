/**
 * Centralized query key registry.
 *
 * Every TanStack Query `queryKey` in the app MUST be built from this registry.
 * Keys follow a hierarchical convention so that prefix-based invalidation works:
 *
 *   invalidateQueries({ queryKey: qk.analyses.root })
 *   → invalidates ALL queries whose key starts with ['analyses', ...]
 *
 * Naming convention:
 *   - `root`   — bare prefix, used only for invalidation (never as an actual queryKey)
 *   - static arrays  — e.g. `qk.analyses.authors` → ['analyses', 'authors']
 *   - factory fns    — e.g. `qk.analyses.list(params)` → ['analyses', 'list', params]
 */

// ─── Root constants ──────────────────────────────────────────────────────────
// Kept private so consumers always go through the `qk` object.

const ALARMS       = 'alarms'       as const
const ANALYSES     = 'analyses'     as const
const ALARM_EVENTS = 'alarm-events' as const
const REPORTS      = 'reports'      as const
const PRODUCTS     = 'products'     as const
const USERS        = 'users'        as const
const ROLES        = 'roles'        as const
const SETTINGS     = 'settings'     as const
const IGNORE_REASONS  = 'ignore-reasons'  as const
const RESOURCE_TYPES  = 'resource-types'  as const
const SYSTEM_EVENTS   = 'system-events'   as const
const PERMISSIONS     = 'permissions'     as const
const PREFERENCES     = 'preferences'     as const

// ─── Registry ────────────────────────────────────────────────────────────────

export const qk = {
  // ── Alarms ──────────────────────────────────────────────────────────────
  alarms: {
    root:   [ALARMS] as const,
    detail: (productId: string, alarmId: string, filters?: object) =>
      [ALARMS, 'detail', productId, alarmId, filters] as const,
  },

  // ── Analyses ─────────────────────────────────────────────────────────────
  analyses: {
    root:       [ANALYSES] as const,
    list:       (params: object) => [ANALYSES, 'list', params] as const,
    daily:      (params: object) => [ANALYSES, 'daily', params] as const,
    oncall:     (params: object) => [ANALYSES, 'oncall', params] as const,
    detail:     (productId: string, id: string) => [ANALYSES, 'detail', productId, id] as const,
    policy:     [ANALYSES, 'policy'] as const,
    forLink:    (...args: (string | null)[]) => [ANALYSES, 'for-link', ...args] as const,
    authors:    [ANALYSES, 'authors'] as const,
  },

  // ── Alarm Events ─────────────────────────────────────────────────────────
  alarmEvents: {
    root:        [ALARM_EVENTS] as const,
    list:        (params: object) => [ALARM_EVENTS, 'list', params] as const,
    daily:       (params: object) => [ALARM_EVENTS, 'daily', params] as const,
    oncall:      (params: object) => [ALARM_EVENTS, 'oncall', params] as const,
    grouped:     (params: object) => [ALARM_EVENTS, 'grouped', params] as const,
    forAnalysis: (analysisId: string) => [ALARM_EVENTS, 'for-analysis', analysisId] as const,
  },

  // ── Reports ──────────────────────────────────────────────────────────────
  reports: {
    root:              [REPORTS] as const,
    analysisStats:     (filters: object) => [REPORTS, 'analysis-stats', filters] as const,
    operatorWorkload:  (filters: object) => [REPORTS, 'operator-workload', filters] as const,
    alarmRanking:      (filters: object) => [REPORTS, 'alarm-ranking', filters] as const,
    monthlyKpi:        (productId: string, year: number, month: number) => [REPORTS, 'monthly-kpi', productId, year, month] as const,
    yearlySummary:     (year: number, productId?: string) => [REPORTS, 'yearly-summary', year, productId] as const,
    mttaTrend:         (filters: object) => [REPORTS, 'mtta-trend', filters] as const,
    dailyActivity:     (year: number, month: number, productId?: string) => [REPORTS, 'daily-activity', year, month, productId] as const,
  },

  // ── Products & sub-resources ─────────────────────────────────────────────
  products: {
    root:          [PRODUCTS] as const,
    list:          [PRODUCTS, 'list'] as const,
    detail:        (id: string) => [PRODUCTS, 'detail', id] as const,
    environments:  (productId: string) => [PRODUCTS, 'environments', productId] as const,
    alarms:        (productId: string) => [PRODUCTS, 'alarms', productId] as const,
    runbooks:      (productId: string) => [PRODUCTS, 'runbooks', productId] as const,
    resources:     (productId: string) => [PRODUCTS, 'resources', productId] as const,
    finalActions:  (productId: string) => [PRODUCTS, 'final-actions', productId] as const,
    ignoredAlarms: (productId: string) => [PRODUCTS, 'ignored-alarms', productId] as const,
    downstreams:   (productId: string) => [PRODUCTS, 'downstreams', productId] as const,
    filterOptions: (productId: string) => [PRODUCTS, 'filter-options', productId] as const,
    /** Cross-product environments used by alarm-events multi-select filter. */
    allEnvironments: (productIds: string[]) => [PRODUCTS, 'environments-all', productIds] as const,
  },

  // ── Users ────────────────────────────────────────────────────────────────
  users: {
    root:        [USERS] as const,
    list:        [USERS, 'list'] as const,
    detail:      (id: string) => [USERS, 'detail', id] as const,
    permissions: (id: string) => [USERS, 'permissions', id] as const,
    profile:     (id: string) => [USERS, 'profile', id] as const,
  },

  // ── Roles ────────────────────────────────────────────────────────────────
  roles: {
    root:       [ROLES] as const,
    list:       [ROLES, 'list'] as const,
    fkOptions:  [ROLES, 'fk-options'] as const,
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  settings: {
    root:         [SETTINGS] as const,
    list:         [SETTINGS, 'list'] as const,
    detail:       (key: string) => [SETTINGS, 'detail', key] as const,
    workingHours: [SETTINGS, 'working-hours'] as const,
    onCallHours:  [SETTINGS, 'on-call-hours'] as const,
  },

  // ── Ignore Reasons ───────────────────────────────────────────────────────
  ignoreReasons: {
    root: [IGNORE_REASONS] as const,
    list: [IGNORE_REASONS, 'list'] as const,
  },

  // ── Resource Types ───────────────────────────────────────────────────────
  resourceTypes: {
    root: [RESOURCE_TYPES] as const,
    list: [RESOURCE_TYPES, 'list'] as const,
  },

  // ── System Events ────────────────────────────────────────────────────────
  systemEvents: {
    root: [SYSTEM_EVENTS] as const,
    list: (params: object) => [SYSTEM_EVENTS, 'list', params] as const,
  },

  // ── Auth / session ───────────────────────────────────────────────────────
  permissions: {
    root: [PERMISSIONS] as const,
    all:  [PERMISSIONS, 'all'] as const,
  },

  preferences: {
    root: [PREFERENCES] as const,
    user: [PREFERENCES, 'user'] as const,
  },
} as const

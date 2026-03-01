// ─── Costanti esistenti ────────────────────────────────────────────────────────

export { SystemEventActions } from './constants/system-event-actions.js';
export type { SystemEventAction } from './constants/system-event-actions.js';

export { SystemEventResources } from './constants/system-event-resources.js';
export type { SystemEventResource } from './constants/system-event-resources.js';

export { SettingTypes } from './constants/setting-types.js';
export type { SettingType } from './constants/setting-types.js';

export { SettingCategories } from './constants/setting-categories.js';
export type { SettingCategory } from './constants/setting-categories.js';

// ─── Costanti nuove ────────────────────────────────────────────────────────────

export { AnalysisTypes, ANALYSIS_TYPE_VALUES } from './constants/analysis-types.js';
export type { AnalysisType } from './constants/analysis-types.js';

export { AnalysisStatuses, ANALYSIS_STATUS_VALUES } from './constants/analysis-statuses.js';
export type { AnalysisStatus } from './constants/analysis-statuses.js';

export { RunbookStatuses, RUNBOOK_STATUS_VALUES } from './constants/runbook-statuses.js';
export type { RunbookStatus } from './constants/runbook-statuses.js';

export { PermissionScopes, PERMISSION_SCOPE_VALUES } from './constants/permission-scopes.js';
export type { PermissionScope } from './constants/permission-scopes.js';

export { Resources, RESOURCE_VALUES } from './constants/resources.js';
export type { Resource } from './constants/resources.js';

export { IGNORE_REASON_CODE_PATTERN, IGNORE_REASON_CODE_REGEX } from './constants/ignore-reason-constraints.js';

export { ValidationConstraints, TIME_HH_MM_PATTERN, TIME_HH_MM_REGEX, WEEKDAY_MIN, WEEKDAY_MAX } from './constants/validation.js';

export { AuthProviders } from './constants/auth-providers.js';
export type { AuthProvider } from './constants/auth-providers.js';

export { AnalysisSortFields, ANALYSIS_SORT_FIELD_VALUES, SortDirections, SORT_DIRECTION_VALUES } from './constants/analysis-sort.js';
export type { AnalysisSortField, SortDirection } from './constants/analysis-sort.js';

export { Themes, THEME_VALUES } from './constants/themes.js';
export type { Theme } from './constants/themes.js';

// ─── Tipi base ─────────────────────────────────────────────────────────────────

export type { PaginationMeta, PaginatedResponse } from './types/pagination.js';
export type { RelatedEntity, RelatedUser } from './types/common.js';
export type { ErrorResponse, MessageResponse } from './types/api-responses.js';

// ─── Tipi di dominio ───────────────────────────────────────────────────────────

export type { AnalysisLink, TrackingEntry } from './types/analysis.js';
export type { IgnoreReasonFieldDef, IgnoreReasonDetailsSchema, IgnoreReason } from './types/ignore-reason.js';
export type { TimeConstraintPeriod, TimeConstraintHours, TimeConstraint } from './types/time-constraint.js';
export type { ResourcePermission, RolePermission, UserPermissions } from './types/permissions.js';
export type { SystemSetting } from './types/system-setting.js';
export type { SystemEvent, SystemEventsResponse } from './types/system-event.js';

// ─── Label ─────────────────────────────────────────────────────────────────────

export { ANALYSIS_TYPE_LABELS, ANALYSIS_STATUS_LABELS } from './labels/analysis-labels.js';
export { RUNBOOK_STATUS_LABELS } from './labels/runbook-labels.js';
export { SYSTEM_EVENT_RESOURCE_LABELS, SYSTEM_EVENT_ACTION_LABELS } from './labels/system-event-labels.js';

// ─── Utility ───────────────────────────────────────────────────────────────────

export { inferLinkType } from './utils/infer-link-type.js';
export { buildDiff } from './utils/build-diff.js';

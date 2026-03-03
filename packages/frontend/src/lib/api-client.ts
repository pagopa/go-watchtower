import { getAccessToken, setAccessToken } from '@/lib/auth-token'
import type {
  AnalysisType,
  AnalysisStatus,
  PermissionScope,
  PaginatedResponse,
  PaginationMeta,
  RelatedEntity,
  RelatedUser,
  ErrorResponse,
  MessageResponse,
  AnalysisLink,
  TrackingEntry,
  IgnoreReason,
  IgnoreReasonDetailsSchema,
  IgnoreReasonFieldDef,
  TimeConstraintPeriod,
  TimeConstraintHours,
  TimeConstraint,
  ResourcePermission,
  RolePermission,
  UserPermissions,
  SystemSetting,
  SystemEvent,
  SystemEventsResponse,
} from '@go-watchtower/shared'

export type {
  AnalysisType,
  AnalysisStatus,
  PermissionScope,
  PaginatedResponse,
  PaginationMeta,
  RelatedEntity,
  RelatedUser,
  ErrorResponse,
  MessageResponse,
  AnalysisLink,
  TrackingEntry,
  IgnoreReason,
  IgnoreReasonDetailsSchema,
  IgnoreReasonFieldDef,
  TimeConstraintPeriod,
  TimeConstraintHours,
  TimeConstraint,
  ResourcePermission,
  RolePermission,
  UserPermissions,
  SystemSetting,
  SystemEvent,
  SystemEventsResponse,
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  params?: Record<string, string | number | boolean | string[] | undefined>
}

function buildUrl(endpoint: string, params?: Record<string, string | number | boolean | string[] | undefined>): string {
  let url = `${API_URL}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) return
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, v))
      } else {
        searchParams.append(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }
  return url
}

async function doFetch(
  url: string,
  accessToken: string,
  init: RequestInit,
  body: unknown
): Promise<Response> {
  const headers: HeadersInit = {
    ...(body !== undefined && { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string>),
    Authorization: `Bearer ${accessToken}`,
  }

  return fetch(url, {
    ...init,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Refreshes the session by calling the NextAuth session endpoint.
 * This triggers the JWT callback server-side, which refreshes the
 * access token if expired. Returns the new access token or empty string.
 */
async function refreshSession(): Promise<string> {
  try {
    const { getSession } = await import('next-auth/react')
    const session = await getSession()
    const newToken = session?.user?.accessToken ?? ''
    if (newToken) {
      setAccessToken(newToken)
    }
    return newToken
  } catch {
    return ''
  }
}

let pendingSessionRefresh: Promise<string> | null = null

function refreshSessionDeduped(): Promise<string> {
  if (!pendingSessionRefresh) {
    pendingSessionRefresh = refreshSession().finally(() => {
      pendingSessionRefresh = null
    })
  }
  return pendingSessionRefresh
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, params, ...init } = options
  const url = buildUrl(endpoint, params)

  // Read the access token synchronously from the module store (kept in sync
  // by TokenSync in auth-provider.tsx). No HTTP round-trip needed.
  // On first render the store may be empty (useEffect hasn't fired yet) —
  // just throw so React Query skips the request and retries later.
  let accessToken = getAccessToken()

  if (!accessToken) {
    accessToken = await refreshSessionDeduped()
  }

  if (!accessToken) {
    throw new ApiClientError('No access token', 401)
  }

  const response = await doFetch(url, accessToken, init, body)

  // On 401, the access token has expired server-side.
  // Try to refresh the session and retry ONCE before giving up.
  if (response.status === 401) {
    const freshToken = await refreshSessionDeduped()
    if (freshToken) {
      const retryResponse = await doFetch(url, freshToken, init, body)
      if (!retryResponse.ok) {
        if (retryResponse.status === 401) {
          throw new ApiClientError('Unauthorized', 401)
        }
        const error = await retryResponse.json().catch(() => ({ message: 'An error occurred' }))
        throw new ApiClientError(
          error.message || error.error || `HTTP error ${retryResponse.status}`,
          retryResponse.status,
          error
        )
      }
      if (retryResponse.status === 204) return {} as T
      return retryResponse.json()
    }
    throw new ApiClientError('Unauthorized', 401)
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }))
    throw new ApiClientError(
      error.message || error.error || `HTTP error ${response.status}`,
      response.status,
      error
    )
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

// Types
export interface User {
  id: string
  email: string
  name: string
  roleName: string
}

export interface Product {
  id: string
  name: string
  description: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateProductData {
  name: string
  description: string
  isActive?: boolean
}

export interface UpdateProductData {
  name?: string
  description?: string
  isActive?: boolean
}

export interface Environment {
  id: string
  name: string
  description: string | null
  order: number
  productId: string
  createdAt: string
  updatedAt: string
}

export interface CreateEnvironmentData {
  name: string
  description?: string
  order?: number
}

export interface UpdateEnvironmentData {
  name?: string
  description?: string | null
  order?: number
}

export interface Microservice {
  id: string
  name: string
  description: string | null
  productId: string
  createdAt: string
  updatedAt: string
}

export interface CreateMicroserviceData {
  name: string
  description?: string
}

export interface UpdateMicroserviceData {
  name?: string
  description?: string | null
}

export interface Runbook {
  id: string
  name: string
  description: string | null
  link: string
  status: 'DRAFT' | 'COMPLETE'
  productId: string
  createdAt: string
  updatedAt: string
}

export interface CreateRunbookData {
  name: string
  description?: string
  link: string
  status?: 'DRAFT' | 'COMPLETE'
}

export interface UpdateRunbookData {
  name?: string
  description?: string | null
  link?: string
  status?: 'DRAFT' | 'COMPLETE'
}

export interface Alarm {
  id: string
  name: string
  description: string | null
  runbookId: string | null
  runbook: { id: string; name: string } | null
  productId: string
  createdAt: string
  updatedAt: string
}

export interface CreateAlarmData {
  name: string
  description?: string
  runbookId?: string | null
}

export interface UpdateAlarmData {
  name?: string
  description?: string | null
  runbookId?: string | null
}

export interface Downstream {
  id: string
  name: string
  description: string | null
  productId: string
  createdAt: string
  updatedAt: string
}

export interface CreateDownstreamData {
  name: string
  description?: string
}

export interface UpdateDownstreamData {
  name?: string
  description?: string | null
}

// Ignored Alarm Types
export interface IgnoredAlarm {
  id: string
  alarmId: string
  environmentId: string
  reason: string | null
  isActive: boolean
  productId: string
  validity: TimeConstraint[]
  exclusions: TimeConstraint[]
  alarm: RelatedEntity
  environment: RelatedEntity
  createdAt: string
  updatedAt: string
}

export interface CreateIgnoredAlarmData {
  alarmId: string
  environmentId: string
  reason?: string | null
  isActive?: boolean
  validity?: TimeConstraint[]
  exclusions?: TimeConstraint[]
}

export interface UpdateIgnoredAlarmData {
  alarmId?: string
  environmentId?: string
  reason?: string | null
  isActive?: boolean
  validity?: TimeConstraint[]
  exclusions?: TimeConstraint[]
}

// Alarm Analysis Types
export interface CreateIgnoreReasonData {
  code: string
  label: string
  description?: string | null
  sortOrder?: number
  detailsSchema?: IgnoreReasonDetailsSchema | null
}

export interface UpdateIgnoreReasonData {
  label?: string
  description?: string | null
  sortOrder?: number
  detailsSchema?: IgnoreReasonDetailsSchema | null
}
export interface AlarmAnalysis {
  id: string
  analysisDate: string
  firstAlarmAt: string
  lastAlarmAt: string
  occurrences: number
  isOnCall: boolean
  analysisType: AnalysisType
  status: AnalysisStatus
  alarmId: string
  errorDetails: string | null
  conclusionNotes: string | null
  ignoreReasonCode: string | null
  ignoreDetails: Record<string, unknown> | null
  operatorId: string
  productId: string
  environmentId: string
  runbookId: string | null
  createdAt: string
  updatedAt: string
  createdById: string
  updatedById: string | null
  product: RelatedEntity
  alarm: RelatedEntity
  operator: RelatedUser
  environment: RelatedEntity
  finalActions: RelatedEntity[]
  runbook: (RelatedEntity & { link?: string; status?: 'DRAFT' | 'COMPLETE' }) | null
  createdBy: RelatedUser
  updatedBy: RelatedUser | null
  microservices: RelatedEntity[]
  downstreams: RelatedEntity[]
  ignoreReason: IgnoreReason | null
  links: Array<{ url: string; name?: string; type?: string }>
  trackingIds: Array<TrackingEntry>
  validationScore: number | null
  qualityScore: number | null
  scoredAt: string | null
}

export interface AlarmAnalysisFilters {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: string
  search?: string
  analysisType?: string
  status?: string
  isOnCall?: boolean
  operatorId?: string
  environmentId?: string
  alarmId?: string
  finalActionId?: string
  productId?: string
  dateFrom?: string
  dateTo?: string
  // Advanced filters
  ignoreReasonCode?: string
  runbookId?: string
  microserviceId?: string
  downstreamId?: string
  traceId?: string
}

export interface CreateAlarmAnalysisData {
  analysisDate: string
  firstAlarmAt: string
  lastAlarmAt: string
  occurrences?: number
  isOnCall?: boolean
  analysisType?: AnalysisType
  status?: AnalysisStatus
  alarmId: string
  errorDetails?: string | null
  conclusionNotes?: string | null
  ignoreReasonCode?: string | null
  ignoreDetails?: Record<string, unknown> | null
  operatorId: string
  environmentId: string
  finalActionIds?: string[]
  runbookId?: string | null
  microserviceIds?: string[]
  downstreamIds?: string[]
  links?: Array<{ url: string; name?: string; type?: string }>
  trackingIds?: TrackingEntry[]
}

export interface UpdateAlarmAnalysisData {
  analysisDate?: string
  firstAlarmAt?: string
  lastAlarmAt?: string
  occurrences?: number
  isOnCall?: boolean
  analysisType?: AnalysisType
  status?: AnalysisStatus
  alarmId?: string
  errorDetails?: string | null
  conclusionNotes?: string | null
  ignoreReasonCode?: string | null
  ignoreDetails?: Record<string, unknown> | null
  operatorId?: string
  environmentId?: string
  finalActionIds?: string[]
  runbookId?: string | null
  microserviceIds?: string[]
  downstreamIds?: string[]
  links?: Array<{ url: string; name?: string; type?: string }>
  trackingIds?: TrackingEntry[]
}

// FinalAction type
export interface FinalAction {
  id: string
  name: string
  description: string | null
  order: number
  isOther: boolean
  productId: string
  createdAt: string
  updatedAt: string
}

export interface CreateFinalActionData {
  name: string
  description?: string
  order?: number
  isOther?: boolean
}

export interface UpdateFinalActionData {
  name?: string
  description?: string | null
  order?: number
  isOther?: boolean
}

// Aggregate filter options for the analyses page
export interface ProductFilterOptions {
  environments: Environment[]
  alarms: Alarm[]
  finalActions: FinalAction[]
  microservices: Microservice[]
  downstreams: Downstream[]
  runbooks: Runbook[]
}

// Analysis author (user who created at least one analysis)
export interface AnalysisAuthor {
  id: string
  name: string
  email: string
}

// User Management Types
export interface UserDetail {
  id: string
  email: string
  name: string
  roleName: string
  provider: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface UserPermissionOverride {
  resource: string
  canRead: PermissionScope | null
  canWrite: PermissionScope | null
  canDelete: PermissionScope | null
  reason: string | null
  grantedByUser: { id: string; name: string; email: string } | null
}

export interface UserDetailWithOverrides extends UserDetail {
  permissionOverrides: UserPermissionOverride[]
}

export interface UserWithPermissions {
  permissions: UserPermissions
  rolePermissions: RolePermission[]
  overrides: UserPermissionOverride[]
}

export interface Role {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  permissions: RolePermission[]
  _count: { users: number }
}

export interface CreateUserData {
  email: string
  password: string
  name: string
  roleId?: string
}

export interface UpdateUserData {
  name?: string
  email?: string
  isActive?: boolean
  roleId?: string
}

export interface SetPermissionOverrideData {
  resource: string
  canRead?: PermissionScope | null
  canWrite?: PermissionScope | null
  canDelete?: PermissionScope | null
  reason?: string
}

export interface ColumnSettings {
  visible: string[]
  order?: string[]
  widths?: Record<string, number>
  renames?: Record<string, string>
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system'
  lastRoute?: string
  columnSettings?: Record<string, ColumnSettings>
  savedFilters?: Record<string, Record<string, unknown>>
  pageSize?: number
  locale?: string
  sidebarCollapsed?: boolean
  analysisFiltersCollapsed?: boolean
  detailPanelWidth?: number
}

// Analysis Stats Types
export interface AnalysisStatsFilters {
  productId?: string
  dateFrom?: string
  dateTo?: string
}

export interface KpiTopItem {
  id: string
  name: string
  count: number
}

export interface KpiStats {
  totalAnalyses: number
  totalAnalysesPrevious: number
  totalOccurrences: number
  totalOccurrencesPrevious: number
  topFinalAction: KpiTopItem | null
  topOperator: KpiTopItem | null
}

export interface AnalysisStats {
  kpi: KpiStats
  byProductEnvironment: Array<{
    productId: string
    productName: string
    environmentId: string
    environmentName: string
    count: number
  }>
  byOperator: Array<{
    operatorId: string
    operatorName: string
    count: number
  }>
  dailyByEnvironment: Array<{
    date: string
    environmentId: string
    environmentName: string
    count: number
    totalOccurrences: number
  }>
  byAnalysisType: Array<{
    analysisType: AnalysisType
    count: number
  }>
  topAlarms: Array<{
    alarmId: string
    alarmName: string
    count: number
  }>
  onCallTrend: Array<{
    month: string
    onCall: number
    normal: number
  }>
}

// Report Types
export type ReportFilters = AnalysisStatsFilters

export interface OperatorWorkloadItem {
  operatorId: string
  operatorName: string
  operatorEmail: string
  totalAnalyses: number
  onCallAnalyses: number
  totalOccurrences: number
  mttaMs: number | null
  byEnvironment: Array<{
    environmentId: string
    environmentName: string
    count: number
    onCallCount: number
    occurrences: number
    mttaMs: number | null
  }>
}

export interface AlarmRankingItem {
  alarmId: string
  alarmName: string
  productId: string
  productName: string
  totalAnalyses: number
  totalOccurrences: number
}

export interface CreateRoleData {
  name: string
  description?: string
}

export interface UpdateRoleData {
  name?: string
  description?: string | null
}

export interface UpdateRolePermissionsData {
  permissions: Array<{
    resource: string
    canRead: PermissionScope
    canWrite: PermissionScope
    canDelete: PermissionScope
  }>
}

export interface SystemEventsFilters {
  action?: string[]
  resource?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// API methods
export const api = {
  // Auth
  me: () => request<User>('/auth/me'),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),

  // Products
  getProducts: () => request<Product[]>('/api/products'),
  getProduct: (id: string) => request<Product>(`/api/products/${id}`),
  createProduct: (data: CreateProductData) =>
    request<Product>('/api/products', { method: 'POST', body: data }),
  updateProduct: (id: string, data: UpdateProductData) =>
    request<Product>(`/api/products/${id}`, { method: 'PUT', body: data }),
  deleteProduct: (id: string) =>
    request<{ message: string }>(`/api/products/${id}`, { method: 'DELETE' }),

  // Environments
  getEnvironments: (productId: string) =>
    request<Environment[]>(`/api/products/${productId}/environments`),
  createEnvironment: (productId: string, data: CreateEnvironmentData) =>
    request<Environment>(`/api/products/${productId}/environments`, { method: 'POST', body: data }),
  updateEnvironment: (productId: string, id: string, data: UpdateEnvironmentData) =>
    request<Environment>(`/api/products/${productId}/environments/${id}`, { method: 'PUT', body: data }),
  deleteEnvironment: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/environments/${id}`, { method: 'DELETE' }),

  // Microservices
  getMicroservices: (productId: string) =>
    request<Microservice[]>(`/api/products/${productId}/microservices`),
  createMicroservice: (productId: string, data: CreateMicroserviceData) =>
    request<Microservice>(`/api/products/${productId}/microservices`, { method: 'POST', body: data }),
  updateMicroservice: (productId: string, id: string, data: UpdateMicroserviceData) =>
    request<Microservice>(`/api/products/${productId}/microservices/${id}`, { method: 'PUT', body: data }),
  deleteMicroservice: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/microservices/${id}`, { method: 'DELETE' }),

  // Runbooks
  getRunbooks: (productId: string) =>
    request<Runbook[]>(`/api/products/${productId}/runbooks`),
  createRunbook: (productId: string, data: CreateRunbookData) =>
    request<Runbook>(`/api/products/${productId}/runbooks`, { method: 'POST', body: data }),
  updateRunbook: (productId: string, id: string, data: UpdateRunbookData) =>
    request<Runbook>(`/api/products/${productId}/runbooks/${id}`, { method: 'PUT', body: data }),
  deleteRunbook: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/runbooks/${id}`, { method: 'DELETE' }),

  // Alarms
  getAlarms: (productId: string) =>
    request<Alarm[]>(`/api/products/${productId}/alarms`),
  createAlarm: (productId: string, data: CreateAlarmData) =>
    request<Alarm>(`/api/products/${productId}/alarms`, { method: 'POST', body: data }),
  updateAlarm: (productId: string, id: string, data: UpdateAlarmData) =>
    request<Alarm>(`/api/products/${productId}/alarms/${id}`, { method: 'PUT', body: data }),
  deleteAlarm: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/alarms/${id}`, { method: 'DELETE' }),

  // Downstreams
  getDownstreams: (productId: string) =>
    request<Downstream[]>(`/api/products/${productId}/downstreams`),
  createDownstream: (productId: string, data: CreateDownstreamData) =>
    request<Downstream>(`/api/products/${productId}/downstreams`, { method: 'POST', body: data }),
  updateDownstream: (productId: string, id: string, data: UpdateDownstreamData) =>
    request<Downstream>(`/api/products/${productId}/downstreams/${id}`, { method: 'PUT', body: data }),
  deleteDownstream: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/downstreams/${id}`, { method: 'DELETE' }),

  // Ignored Alarms
  getIgnoredAlarms: (productId: string) =>
    request<IgnoredAlarm[]>(`/api/products/${productId}/ignored-alarms`),
  getIgnoredAlarm: (productId: string, id: string) =>
    request<IgnoredAlarm>(`/api/products/${productId}/ignored-alarms/${id}`),
  createIgnoredAlarm: (productId: string, data: CreateIgnoredAlarmData) =>
    request<IgnoredAlarm>(`/api/products/${productId}/ignored-alarms`, { method: 'POST', body: data }),
  updateIgnoredAlarm: (productId: string, id: string, data: UpdateIgnoredAlarmData) =>
    request<IgnoredAlarm>(`/api/products/${productId}/ignored-alarms/${id}`, { method: 'PUT', body: data }),
  deleteIgnoredAlarm: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/ignored-alarms/${id}`, { method: 'DELETE' }),

  // Final Actions
  getFinalActions: (productId: string) =>
    request<FinalAction[]>(`/api/products/${productId}/final-actions`),
  createFinalAction: (productId: string, data: CreateFinalActionData) =>
    request<FinalAction>(`/api/products/${productId}/final-actions`, { method: 'POST', body: data }),
  updateFinalAction: (productId: string, id: string, data: UpdateFinalActionData) =>
    request<FinalAction>(`/api/products/${productId}/final-actions/${id}`, { method: 'PUT', body: data }),
  deleteFinalAction: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/final-actions/${id}`, { method: 'DELETE' }),

  // Filter options (aggregate)
  getFilterOptions: (productId: string) =>
    request<ProductFilterOptions>(`/api/products/${productId}/filter-options`),

  // Analyses
  getAllAnalyses: (filters?: AlarmAnalysisFilters) =>
    request<PaginatedResponse<AlarmAnalysis>>('/api/analyses', {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),
  getAnalyses: (productId: string, filters?: AlarmAnalysisFilters) =>
    request<PaginatedResponse<AlarmAnalysis>>(`/api/products/${productId}/analyses`, {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),
  getAnalysis: (productId: string, id: string) =>
    request<AlarmAnalysis>(`/api/products/${productId}/analyses/${id}`),
  createAnalysis: (productId: string, data: CreateAlarmAnalysisData) =>
    request<AlarmAnalysis>(`/api/products/${productId}/analyses`, { method: 'POST', body: data }),
  updateAnalysis: (productId: string, id: string, data: UpdateAlarmAnalysisData) =>
    request<AlarmAnalysis>(`/api/products/${productId}/analyses/${id}`, { method: 'PUT', body: data }),
  deleteAnalysis: (productId: string, id: string) =>
    request<{ message: string }>(`/api/products/${productId}/analyses/${id}`, { method: 'DELETE' }),
  getAnalysisStats: (filters?: AnalysisStatsFilters) =>
    request<AnalysisStats>('/api/analyses/stats', {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),
  getAnalysisAuthors: () => request<AnalysisAuthor[]>('/api/analyses/authors'),
  getIgnoreReasons: () => request<IgnoreReason[]>('/api/ignore-reasons'),
  getIgnoreReason: (code: string) => request<IgnoreReason>(`/api/ignore-reasons/${code}`),
  createIgnoreReason: (data: CreateIgnoreReasonData) =>
    request<IgnoreReason>('/api/ignore-reasons', { method: 'POST', body: data }),
  updateIgnoreReason: (code: string, data: UpdateIgnoreReasonData) =>
    request<IgnoreReason>(`/api/ignore-reasons/${code}`, { method: 'PATCH', body: data }),
  deleteIgnoreReason: (code: string) =>
    request<{ message: string }>(`/api/ignore-reasons/${code}`, { method: 'DELETE' }),

  // Reports
  getOperatorWorkload: (filters?: ReportFilters) =>
    request<OperatorWorkloadItem[]>('/api/reports/operator-workload', {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),
  getAlarmRanking: (filters?: ReportFilters) =>
    request<AlarmRankingItem[]>('/api/reports/alarm-ranking', {
      params: filters as Record<string, string | number | boolean | undefined>,
    }),

  // Users
  getUsers: () => request<UserDetail[]>('/api/users'),
  getUser: (id: string) => request<UserDetailWithOverrides>(`/api/users/${id}`),
  createUser: (data: CreateUserData) =>
    request<UserDetail>('/api/users', { method: 'POST', body: data }),
  updateUser: (id: string, data: UpdateUserData) =>
    request<UserDetail>(`/api/users/${id}`, { method: 'PUT', body: data }),
  deleteUser: (id: string) =>
    request<{ message: string }>(`/api/users/${id}`, { method: 'DELETE' }),

  // User Permissions
  getUserPermissions: (id: string) =>
    request<UserWithPermissions>(`/api/users/${id}/permissions`),
  setUserPermissionOverride: (id: string, data: SetPermissionOverrideData) =>
    request<{ message: string }>(`/api/users/${id}/permissions`, { method: 'PUT', body: data }),
  removeUserPermissionOverride: (id: string, resource: string) =>
    request<{ message: string }>(`/api/users/${id}/permissions/${resource}`, { method: 'DELETE' }),

  // Roles
  getRoles: () => request<Role[]>('/api/roles'),
  getRoleById: (id: string) => request<Role>(`/api/roles/${id}`),
  createRole: (data: CreateRoleData) =>
    request<Role>('/api/roles', { method: 'POST', body: data }),
  updateRole: (id: string, data: UpdateRoleData) =>
    request<Role>(`/api/roles/${id}`, { method: 'PUT', body: data }),
  deleteRole: (id: string) =>
    request<void>(`/api/roles/${id}`, { method: 'DELETE' }),
  updateRolePermissions: (id: string, data: UpdateRolePermissionsData) =>
    request<Role>(`/api/roles/${id}/permissions`, { method: 'PUT', body: data }),

  // User Preferences
  getMyPreferences: () => request<UserPreferences>('/api/users/me/preferences'),
  updateMyPreferences: (data: Partial<UserPreferences>) =>
    request<UserPreferences>('/api/users/me/preferences', { method: 'PATCH', body: data }),

  // Permissions
  getMyPermissions: async () => {
    const response = await request<{ permissions: UserPermissions }>('/api/permissions/me')
    return response.permissions
  },

  // System Events (Audit Log)
  getSystemEvents: (filters?: SystemEventsFilters) =>
    request<SystemEventsResponse>('/api/system-events', {
      params: filters as Record<string, string | number | boolean | string[] | undefined>,
    }),

  // System Settings
  getSettings: () => request<SystemSetting[]>('/api/settings'),
  getSetting: (key: string) => request<SystemSetting>(`/api/settings/${key}`),
  updateSetting: (key: string, value: unknown) =>
    request<SystemSetting>(`/api/settings/${key}`, { method: 'PATCH', body: { value } }),
}

// Server-side API client (for Server Components)
export async function serverRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, params, ...init } = options

  const serverApiUrl = process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || ''

  let url = `${serverApiUrl}${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    })
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }

  const headers: HeadersInit = {
    ...(body !== undefined && { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${accessToken}`,
    ...(init.headers as Record<string, string>),
  }

  const response = await fetch(url, {
    ...init,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }))
    throw new ApiClientError(
      error.message || error.error || `HTTP error ${response.status}`,
      response.status,
      error
    )
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Mail, Shield, CalendarDays, Loader2, Check, Pencil, X,
  Monitor, Sun, Moon, Rows3, PanelLeft, SlidersHorizontal,
  KeyRound, Globe, RotateCcw, Eye, EyeOff, Lock, ChevronDown, ChevronUp,
  Bell, BellOff,
} from 'lucide-react'
import { api, type UserDetail, type AlertPriorityLevel } from '@/lib/api-client'
import { qk } from '@/lib/query-keys'
import type { ColumnSettings } from '@go-watchtower/shared'
import { formatDateLong as formatDate, getInitials } from '@/lib/format'
import { COLUMN_REGISTRY, LIST_LABELS, type ColumnDef } from '@/lib/column-registry'
import { usePreferences } from '@/hooks/use-preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  AlertPriorityCodes,
  AUTH_PROVIDER_LABELS,
  normalizeAlertPriorityCode,
} from '@go-watchtower/shared'
import type { AuthProvider } from '@go-watchtower/shared'
import { useNotificationPermission } from '@/hooks/use-notification-permission'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THEME_CONFIG = {
  light: { label: 'Chiaro', icon: Sun },
  dark: { label: 'Scuro', icon: Moon },
  system: { label: 'Sistema', icon: Monitor },
} as const

function getEnabledPriorityCodes(priorityLevels: AlertPriorityLevel[], notifications: Record<string, unknown> | undefined): Set<string> {
  const prefs = notifications as {
    priority?: { enabledCodes?: string[] }
    types?: Record<string, boolean>
  } | undefined

  if (prefs?.priority?.enabledCodes) {
    return new Set(prefs.priority.enabledCodes.map(normalizeAlertPriorityCode))
  }

  const legacy = new Set<string>()
  if (prefs?.types) {
    if (prefs.types.ON_CALL_ALARM !== false) legacy.add(AlertPriorityCodes.ON_CALL)
    if (prefs.types.HIGH_PRIORITY_ALARM !== false) legacy.add(AlertPriorityCodes.HIGH)
    if (legacy.size > 0) return legacy
  }

  return new Set(priorityLevels.filter((level) => level.defaultNotify).map((level) => level.code))
}

// ─── Column analysis ──────────────────────────────────────────────────────────

interface ColumnState {
  def: ColumnDef
  position: number | null       // 1-based position in visible order, null if hidden
  currentLabel: string          // possibly renamed
  isVisible: boolean
  defaultVisible: boolean
  isVisibilityChanged: boolean
  customWidth: number | undefined
  isWidthCustom: boolean
  isRenamed: boolean
  hasAnyOverride: boolean
}

function buildColumnStates(settings: ColumnSettings, definitions: ColumnDef[]): ColumnState[] {
  const visibleList = settings.visible ?? []
  const orderList = settings.order ?? visibleList
  const visibleSet = new Set(visibleList)
  const positionMap = new Map(orderList.map((id, i) => [id, i + 1]))

  return definitions.map((def) => {
    const isVisible = visibleSet.has(def.id)
    const defaultVisible = def.defaultVisible !== false
    const isVisibilityChanged = isVisible !== defaultVisible
    const customWidth = settings.widths?.[def.id]
    const isWidthCustom = customWidth !== undefined && customWidth !== def.defaultWidth
    const rename = settings.renames?.[def.id]
    const isRenamed = !!rename
    const currentLabel = rename ?? def.label
    const position = isVisible ? (positionMap.get(def.id) ?? null) : null
    const hasAnyOverride = isVisibilityChanged || isWidthCustom || isRenamed

    return {
      def,
      position,
      currentLabel,
      isVisible,
      defaultVisible,
      isVisibilityChanged,
      customWidth,
      isWidthCustom,
      isRenamed,
      hasAnyOverride,
    }
  })
}

// ─── Column settings detail ───────────────────────────────────────────────────

function ColumnSettingsDetail({
  listKey,
  settings,
  onResetWidth,
  onResetRename,
}: {
  listKey: string
  settings: ColumnSettings
  onResetWidth: (columnId: string) => void
  onResetRename: (columnId: string) => void
}) {
  const definitions = COLUMN_REGISTRY[listKey]
  if (!definitions) return null

  const columns = buildColumnStates(settings, definitions)

  // Sort: visible columns by position, then hidden columns (in definition order)
  const sorted = [...columns].sort((a, b) => {
    if (a.isVisible && !b.isVisible) return -1
    if (!a.isVisible && b.isVisible) return 1
    if (a.isVisible && b.isVisible) return (a.position ?? 999) - (b.position ?? 999)
    return 0
  })

  const overrideCount = columns.filter((c) => c.hasAnyOverride).length

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground">{overrideCount}</span>
        {' '}colonne con impostazioni personalizzate su{' '}
        <span className="tabular-nums">{definitions.length}</span> totali
      </p>

      <div className="overflow-hidden rounded-lg border border-border">
        {/* Table header */}
        <div className="grid grid-cols-[2rem_1fr_6rem_6rem] gap-0 border-b bg-muted/40">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">#</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Colonna</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Visibilità</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Larghezza</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/60">
          {sorted.map((col) => (
            <div
              key={col.def.id}
              className={cn(
                'grid grid-cols-[2rem_1fr_6rem_6rem] gap-0 transition-colors',
                col.hasAnyOverride
                  ? 'bg-amber-50/40 dark:bg-amber-950/20'
                  : 'bg-transparent',
                !col.isVisible && 'opacity-50',
              )}
            >
              {/* Position */}
              <div className="flex items-center px-3 py-2.5">
                <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
                  {col.position ?? '—'}
                </span>
              </div>

              {/* Column name */}
              <div className="flex min-w-0 items-center gap-1.5 px-3 py-2.5">
                {col.def.locked && (
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                )}
                <div className="min-w-0">
                  {col.isRenamed ? (
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="truncate text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {col.currentLabel}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground/50">
                        ← {col.def.label}
                      </span>
                      <button
                        onClick={() => onResetRename(col.def.id)}
                        className="shrink-0 rounded px-1 py-px text-[10px] text-muted-foreground/50 hover:bg-muted hover:text-foreground"
                        title="Ripristina nome originale"
                      >
                        ripristina
                      </button>
                    </div>
                  ) : (
                    <span className="truncate text-xs text-foreground/80">{col.def.label}</span>
                  )}
                </div>
              </div>

              {/* Visibility */}
              <div className="flex items-center px-3 py-2.5">
                {col.isVisible ? (
                  <span className={cn(
                    'flex items-center gap-1 text-xs',
                    col.isVisibilityChanged
                      ? 'font-medium text-amber-700 dark:text-amber-400'
                      : 'text-muted-foreground/70',
                  )}>
                    <Eye className="h-3 w-3 shrink-0" />
                    <span>Visibile</span>
                  </span>
                ) : (
                  <span className={cn(
                    'flex items-center gap-1 text-xs',
                    col.isVisibilityChanged
                      ? 'font-medium text-amber-700/70 dark:text-amber-400/70'
                      : 'text-muted-foreground/40',
                  )}>
                    <EyeOff className="h-3 w-3 shrink-0" />
                    <span>Nascosta</span>
                  </span>
                )}
              </div>

              {/* Width */}
              <div className="flex items-center gap-1 px-3 py-2.5">
                {col.isWidthCustom ? (
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                      {col.customWidth}px
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">
                      /{col.def.defaultWidth}
                    </span>
                    <button
                      onClick={() => onResetWidth(col.def.id)}
                      className="rounded px-1 py-px text-[10px] text-muted-foreground/40 hover:bg-muted hover:text-foreground"
                      title="Ripristina larghezza default"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground/40">
                    {col.def.defaultWidth}px
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground',
        className
      )}
    >
      {getInitials(name)}
    </div>
  )
}

// ─── Info row (readonly) ──────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  )
}

// ─── Preference row ───────────────────────────────────────────────────────────

function PrefRow({
  icon: Icon,
  label,
  children,
  onReset,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
  onReset?: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium">{children}</div>
      </div>
      {onReset && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground/40 hover:text-foreground"
          onClick={onReset}
          title="Ripristina default"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1 text-base font-semibold text-foreground">{children}</h2>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ProfilePageContent() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const { setTheme } = useTheme()
  const { preferences, updatePreferences } = usePreferences()

  const userId = session?.user?.id ?? ''

  const { data: userDetail, isLoading } = useQuery<UserDetail>({
    queryKey: qk.users.profile(userId),
    queryFn: () => api.getUser(userId),
    enabled: !!userId,
    staleTime: 30_000,
  })

  // Editable name state
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')

  useEffect(() => {
    if (session?.user?.name) setNameValue(session.user.name)
  }, [session?.user?.name])

  const { mutate: saveName, isPending } = useMutation({
    mutationFn: (name: string) => api.updateUser(userId, { name }),
    onSuccess: (updated) => {
      queryClient.setQueryData<UserDetail>(qk.users.profile(userId), updated)
      queryClient.invalidateQueries({ queryKey: qk.users.profile(userId) })
      toast.success('Nome aggiornato con successo')
      setEditing(false)
    },
    onError: () => {
      toast.error('Errore durante il salvataggio')
    },
  })

  const handleSave = () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === session?.user?.name) {
      setEditing(false)
      return
    }
    saveName(trimmed)
  }

  const handleCancel = () => {
    setNameValue(session?.user?.name ?? '')
    setEditing(false)
  }

  // ─── Column settings expand state ────────────────────────────────────────────
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set())
  const toggleExpand = (key: string) => {
    setExpandedLists((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ─── Reset handlers ──────────────────────────────────────────────────────────

  const handleResetTheme = useCallback(() => {
    setTheme('system')
    updatePreferences({ theme: 'system' })
    toast.success('Tema ripristinato a "Sistema"')
  }, [setTheme, updatePreferences])

  const handleResetPageSize = useCallback(() => {
    updatePreferences({ pageSize: 10 })
    toast.success('Righe per pagina ripristinate a 10')
  }, [updatePreferences])

  const handleResetSidebar = useCallback(() => {
    updatePreferences({ sidebarCollapsed: false })
    toast.success('Sidebar ripristinata a espansa')
  }, [updatePreferences])

  const handleResetFilters = useCallback(() => {
    updatePreferences({ analysisFiltersCollapsed: true })
    toast.success('Filtri analisi ripristinati a collassati')
  }, [updatePreferences])

  const handleResetAllColumns = useCallback((listKey: string) => {
    const current = preferences.columnSettings ?? {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [listKey]: _removed, ...rest } = current
    updatePreferences({ columnSettings: rest })
    toast.success(`Colonne "${LIST_LABELS[listKey] ?? listKey}" ripristinate`)
  }, [preferences.columnSettings, updatePreferences])

  const handleResetColumnWidth = useCallback((listKey: string, columnId: string) => {
    const current = preferences.columnSettings ?? {}
    const listSettings = current[listKey]
    if (!listSettings) return
    const { [columnId]: _w, ...restWidths } = listSettings.widths ?? {}
    void _w
    updatePreferences({
      columnSettings: {
        ...current,
        [listKey]: { ...listSettings, widths: restWidths },
      },
    })
    toast.success('Larghezza colonna ripristinata')
  }, [preferences.columnSettings, updatePreferences])

  const handleResetColumnRename = useCallback((listKey: string, columnId: string) => {
    const current = preferences.columnSettings ?? {}
    const listSettings = current[listKey]
    if (!listSettings) return
    const { [columnId]: _r, ...restRenames } = listSettings.renames ?? {}
    void _r
    updatePreferences({
      columnSettings: {
        ...current,
        [listKey]: { ...listSettings, renames: restRenames },
      },
    })
    toast.success('Nome colonna ripristinato')
  }, [preferences.columnSettings, updatePreferences])

  // ─── Notification preferences ─────────────────────────────────────────────
  const { permission: notifPermission, request: requestNotifPermission, isSupported: notifSupported } = useNotificationPermission()
  const { data: priorityLevels = [] } = useQuery<AlertPriorityLevel[]>({
    queryKey: qk.priorityLevels.list,
    queryFn: api.getPriorityLevels,
    staleTime: 5 * 60_000,
  })
  const notifPrefs = preferences.notifications
  const notifEnabled = notifPrefs?.enabled ?? false
  const enabledPriorityCodes = getEnabledPriorityCodes(priorityLevels, notifPrefs as Record<string, unknown> | undefined)

  const handleToggleNotifMaster = useCallback(async () => {
    if (notifEnabled) {
      updatePreferences({
        notifications: {
          enabled: false,
          priority: { enabledCodes: [...enabledPriorityCodes] },
          types: notifPrefs?.types,
        },
      })
      return
    }
    if (notifSupported && notifPermission !== 'granted') {
      await requestNotifPermission()
    }
    const nextCodes = enabledPriorityCodes.size > 0
      ? [...enabledPriorityCodes]
      : priorityLevels.filter((level) => level.defaultNotify).map((level) => level.code)
    updatePreferences({
      notifications: {
        enabled: true,
        priority: { enabledCodes: nextCodes },
        types: notifPrefs?.types,
      },
    })
  }, [enabledPriorityCodes, notifEnabled, notifPrefs?.types, notifPermission, notifSupported, priorityLevels, requestNotifPermission, updatePreferences])

  const handleTogglePriorityCode = useCallback(async (code: string) => {
    const nextCodes = new Set(enabledPriorityCodes)
    const currentlyOn = notifEnabled && nextCodes.has(code)
    if (!currentlyOn) {
      if (notifSupported && notifPermission !== 'granted') {
        await requestNotifPermission()
      }
      nextCodes.add(code)
    } else {
      nextCodes.delete(code)
    }
    updatePreferences({
      notifications: {
        enabled: nextCodes.size > 0,
        priority: { enabledCodes: [...nextCodes] },
        types: notifPrefs?.types,
      },
    })
  }, [enabledPriorityCodes, notifEnabled, notifPermission, notifPrefs?.types, notifSupported, requestNotifPermission, updatePreferences])


  // ─── Derived values ──────────────────────────────────────────────────────────

  const displayName = session?.user?.name ?? '—'
  const email = session?.user?.email ?? '—'
  const roleName = session?.user?.roleName ?? '—'
  const provider = userDetail?.provider ?? ''
  const createdAt = userDetail?.createdAt
  const updatedAt = userDetail?.updatedAt

  const theme = preferences.theme ?? 'system'
  const ThemeIcon = THEME_CONFIG[theme]?.icon ?? Monitor
  const themeLabel = THEME_CONFIG[theme]?.label ?? 'Sistema'
  const pageSize = preferences.pageSize ?? 10
  const sidebarCollapsed = preferences.sidebarCollapsed ?? false
  const filtersCollapsed = preferences.analysisFiltersCollapsed ?? true

  const columnSettingsEntries = Object.entries(preferences.columnSettings ?? {})

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ── Profile header card ── */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          {isLoading || !session ? (
            <Skeleton className="h-20 w-20 rounded-full" />
          ) : (
            <Avatar name={displayName} className="h-20 w-20 text-2xl" />
          )}

          <div className="min-w-0 flex-1">
            {isLoading || !session ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-5 w-24" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">{email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="mr-1 h-3 w-3" />
                    {roleName}
                  </Badge>
                  {provider && (
                    <Badge variant="outline" className="text-xs">
                      <KeyRound className="mr-1 h-3 w-3" />
                      {AUTH_PROVIDER_LABELS[provider as AuthProvider] ?? provider}
                    </Badge>
                  )}
                  {userDetail?.isActive === false && (
                    <Badge variant="destructive" className="text-xs">
                      Disattivato
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* ── Dati profilo ── */}
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionTitle>Dati profilo</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Puoi modificare solo il tuo nome completo.
          </p>

          {/* Editable name */}
          <div className="mb-2">
            <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
              Nome completo
            </Label>
            {editing ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    if (e.key === 'Escape') handleCancel()
                  }}
                  className="h-9 flex-1"
                  disabled={isPending}
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleSave}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={handleCancel}
                  disabled={isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-sm font-medium">{displayName}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Readonly fields */}
          <div className="divide-y divide-border/60">
            <InfoRow icon={Mail} label="Email">
              <span className="text-muted-foreground">{email}</span>
            </InfoRow>
            <InfoRow icon={Shield} label="Ruolo">
              <span className="text-muted-foreground">{roleName}</span>
            </InfoRow>
            <InfoRow icon={KeyRound} label="Accesso tramite">
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="text-muted-foreground">
                  {AUTH_PROVIDER_LABELS[provider as AuthProvider] ?? provider ?? '—'}
                </span>
              )}
            </InfoRow>
            <InfoRow icon={CalendarDays} label="Membro dal">
              {isLoading ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <span className="text-muted-foreground">
                  {createdAt ? formatDate(createdAt) : '—'}
                </span>
              )}
            </InfoRow>
            {updatedAt && updatedAt !== createdAt && (
              <InfoRow icon={CalendarDays} label="Ultimo aggiornamento">
                <span className="text-muted-foreground">{formatDate(updatedAt)}</span>
              </InfoRow>
            )}
          </div>
        </div>

        {/* ── Preferenze ── */}
        <div className="rounded-xl border border-border bg-card p-6">
          <SectionTitle>Preferenze</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">
            Impostazioni dell&apos;interfaccia. Usa{' '}
            <RotateCcw className="inline h-3 w-3 text-muted-foreground" />{' '}
            per ripristinare il valore di default.
          </p>

          <div className="divide-y divide-border/60">
            <PrefRow
              icon={ThemeIcon}
              label="Tema"
              onReset={theme !== 'system' ? handleResetTheme : undefined}
            >
              <span>{themeLabel}</span>
            </PrefRow>

            <PrefRow
              icon={Rows3}
              label="Righe per pagina"
              onReset={pageSize !== 10 ? handleResetPageSize : undefined}
            >
              <span>{pageSize} righe</span>
            </PrefRow>

            <PrefRow
              icon={PanelLeft}
              label="Sidebar"
              onReset={sidebarCollapsed ? handleResetSidebar : undefined}
            >
              <span>{sidebarCollapsed ? 'Compressa' : 'Espansa'}</span>
            </PrefRow>

            <PrefRow
              icon={SlidersHorizontal}
              label="Filtri analisi"
              onReset={!filtersCollapsed ? handleResetFilters : undefined}
            >
              <span>{filtersCollapsed ? 'Collassati' : 'Espansi'}</span>
            </PrefRow>

            {preferences.locale && (
              <PrefRow icon={Globe} label="Lingua">
                <span>{preferences.locale}</span>
              </PrefRow>
            )}
          </div>

          <Separator className="my-4" />

          <div className="rounded-lg bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Le preferenze vengono aggiornate automaticamente mentre usi
              l&apos;applicazione (tema, sidebar, filtri, righe per pagina).
            </p>
          </div>
        </div>
      </div>

      {/* ── Notifiche ── */}
      <div id="notifiche" className="rounded-xl border border-border bg-card p-6">
        <SectionTitle>Notifiche</SectionTitle>
        <p className="mb-5 text-sm text-muted-foreground">
          Ricevi notifiche browser in tempo reale per eventi importanti,
          anche quando sei su un&apos;altra pagina.
        </p>

        {/* ── Master toggle + browser status ── */}
        <div className={cn(
          'rounded-lg border p-4 transition-colors',
          notifEnabled
            ? 'border-primary/20 bg-primary/[0.03]'
            : 'border-border bg-muted/20',
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
              notifEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
            )}>
              {notifEnabled ? <Bell className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {notifEnabled ? 'Notifiche attive' : 'Notifiche disattivate'}
              </p>
              {notifEnabled && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Il supervisore monitora gli allarmi ogni 30 secondi
                </p>
              )}
            </div>
            <button
              onClick={handleToggleNotifMaster}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
                notifEnabled
                  ? 'bg-primary border-primary dark:bg-blue-600 dark:border-blue-600'
                  : 'bg-zinc-300 border-zinc-300 dark:bg-zinc-600 dark:border-zinc-500',
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform',
                notifEnabled ? 'translate-x-6' : 'translate-x-1',
              )} />
            </button>
          </div>

          {/* Browser permission status bar */}
          {notifEnabled && (
            <div className={cn(
              'mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs',
              notifPermission === 'granted'
                ? 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                : notifPermission === 'denied'
                  ? 'bg-amber-500/5 text-amber-700 dark:text-amber-400'
                  : 'bg-muted text-muted-foreground',
            )}>
              <span className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                notifPermission === 'granted'
                  ? 'bg-emerald-500'
                  : notifPermission === 'denied'
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground/50',
              )} />
              <span className="flex-1">
                {notifPermission === 'granted' && 'Permesso browser concesso — le notifiche verranno inviate'}
                {notifPermission === 'denied' && (
                  <>
                    Permesso browser negato — clicca sull&apos;icona lucchetto (o scudo) nella barra indirizzi,
                    apri &quot;Impostazioni sito&quot; e imposta Notifiche su &quot;Consenti&quot;, poi ricarica la pagina.
                  </>
                )}
                {notifPermission === 'default' && 'Permesso non ancora richiesto — verrà chiesto al primo evento'}
              </span>
              {notifPermission === 'granted' && (
                <button
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  onClick={() => {
                    new Notification('Watchtower — Test notifica', {
                      body: 'Le notifiche browser funzionano correttamente.',
                      tag: 'watchtower-test',
                      icon: '/logo1.png',
                    })
                  }}
                >
                  Invia test
                </button>
              )}
              {notifPermission === 'denied' && (
                <button
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                  onClick={requestNotifPermission}
                >
                  Richiedi permesso
                </button>
              )}
              {notifPermission === 'default' && (
                <button
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  onClick={requestNotifPermission}
                >
                  Richiedi permesso
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Priority notification types ── */}
        {notifEnabled && (
          <div className="mt-5 space-y-4">
            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Allarmi scattati
              </p>
              <div className="space-y-1">
                {[...priorityLevels].filter((level) => level.isActive).sort((a, b) => b.rank - a.rank).map((level) => {
                  const isOn = enabledPriorityCodes.has(level.code)
                  return (
                    <div
                      key={level.code}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors cursor-pointer',
                        isOn
                          ? 'border-primary/15 bg-primary/[0.02] hover:bg-primary/[0.04]'
                          : 'border-transparent bg-muted/30 hover:bg-muted/50 opacity-60',
                      )}
                      onClick={() => void handleTogglePriorityCode(level.code)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{level.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Codice {level.code}
                          {level.countsAsOnCall ? ' · conta come on-call' : ''}
                          {level.defaultNotify ? ' · attiva di default' : ''}
                        </p>
                      </div>
                      <button
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
                          isOn
                            ? 'bg-primary border-primary dark:bg-blue-600 dark:border-blue-600'
                            : 'bg-zinc-300 border-zinc-300 dark:bg-zinc-600 dark:border-zinc-500',
                        )}
                        tabIndex={-1}
                      >
                        <span className={cn(
                          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow-lg transition-transform',
                          isOn ? 'translate-x-[18px]' : 'translate-x-0.5',
                        )} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {!notifSupported && (
          <>
            <Separator className="my-4" />
            <div className="rounded-lg bg-muted/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Il browser in uso non supporta le notifiche.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Impostazioni colonne ── */}
      {columnSettingsEntries.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <SectionTitle>Impostazioni colonne</SectionTitle>
              <p className="text-sm text-muted-foreground">
                Personalizzazioni di visibilità, ordine, larghezze e rinominazioni per le liste.
                Le celle in <span className="font-medium text-amber-700 dark:text-amber-400">ambra</span> indicano valori modificati rispetto al default.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {columnSettingsEntries.map(([listKey, settings]) => {
              const isExpanded = expandedLists.has(listKey)
              const definitions = COLUMN_REGISTRY[listKey]
              const overrideCount = definitions
                ? buildColumnStates(settings, definitions).filter((c) => c.hasAnyOverride).length
                : 0

              return (
                <div key={listKey} className="rounded-lg border border-border overflow-hidden">
                  {/* List header */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/20">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      onClick={() => toggleExpand(listKey)}
                    >
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      }
                      <span className="text-sm font-semibold">
                        {LIST_LABELS[listKey] ?? listKey}
                      </span>
                      {overrideCount > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                          {overrideCount} personalizzate
                        </span>
                      )}
                    </button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-xs"
                      onClick={() => handleResetAllColumns(listKey)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Ripristina tutto
                    </Button>
                  </div>

                  {/* Detail table (expandable) */}
                  {isExpanded && (
                    <div className="border-t border-border p-4">
                      <ColumnSettingsDetail
                        listKey={listKey}
                        settings={settings}
                        onResetWidth={(columnId) => handleResetColumnWidth(listKey, columnId)}
                        onResetRename={(columnId) => handleResetColumnRename(listKey, columnId)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

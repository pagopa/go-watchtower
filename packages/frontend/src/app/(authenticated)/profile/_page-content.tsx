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
  Bell, BellOff, Copy, Terminal, Trash2,
} from 'lucide-react'
import { api, type UserDetail, type AlertPriorityLevel, type CliTokenMetadata } from '@/lib/api-client'
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

function formatIsoDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

// ─── CLI token ────────────────────────────────────────────────────────────────

function CliTokenSection() {
  const queryClient = useQueryClient()
  const [ttlDays, setTtlDays] = useState(30)
  const [ttlInitialized, setTtlInitialized] = useState(false)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)

  const { data: metadata, isLoading } = useQuery<CliTokenMetadata>({
    queryKey: qk.profile.cliToken,
    queryFn: api.getCliTokenMetadata,
    staleTime: 30_000,
  })

  // Il default arriva dal server: si adotta una volta sola, al primo caricamento,
  // per non sovrascrivere quello che l'utente ha nel frattempo scelto. Nel render
  // e non in un effetto, così il campo non mostra mai il 30 di partenza
  // (https://react.dev/learn/you-might-not-need-an-effect).
  if (metadata && !ttlInitialized) {
    setTtlDays(metadata.defaultTtlDays)
    setTtlInitialized(true)
  }

  const maxTtlDays = metadata?.maxTtlDays ?? 90
  const clampedTtlDays = Math.min(Math.max(1, Math.trunc(ttlDays || 1)), maxTtlDays)

  const createMutation = useMutation({
    mutationFn: () => api.createCliToken({ expiresInDays: clampedTtlDays }),
    onSuccess: (response) => {
      setGeneratedToken(response.token)
      queryClient.setQueryData<CliTokenMetadata>(qk.profile.cliToken, {
        hint: response.hint,
        createdAt: response.createdAt,
        lastUsedAt: null,
        expiresAt: response.expiresAt,
        defaultTtlDays: response.defaultTtlDays,
        maxTtlDays: response.maxTtlDays,
      })
      toast.success('Token CLI generato')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const revokeMutation = useMutation({
    mutationFn: api.revokeCliToken,
    onSuccess: () => {
      setGeneratedToken(null)
      queryClient.setQueryData<CliTokenMetadata | undefined>(qk.profile.cliToken, (current) => current
        ? { ...current, hint: null, createdAt: null, lastUsedAt: null, expiresAt: null }
        : current)
      toast.success('Token CLI revocato')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const hasToken = metadata?.hint != null
  // `Date.now()` durante il render darebbe un valore diverso a ogni render, e il
  // badge dipenderebbe da quando React decide di ridisegnare. L'istante si fissa
  // all'apertura della pagina: la scadenza di un token CLI è a giorni, e un
  // ricaricamento aggiorna comunque il confronto.
  const [openedAt] = useState(() => Date.now())
  const isExpired = hasToken && metadata?.expiresAt
    ? new Date(metadata.expiresAt).getTime() <= openedAt
    : false

  const copyGeneratedToken = () => {
    if (!generatedToken) return
    void navigator.clipboard.writeText(generatedToken)
      .then(() => toast.success('Token copiato'))
      .catch(() => toast.error('Copia non riuscita'))
  }

  const revoke = () => {
    if (!window.confirm('Revocare il token CLI corrente?')) return
    revokeMutation.mutate()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle>Token CLI Watchtower</SectionTitle>
          <p className="text-sm text-muted-foreground">Accesso personale per esecuzioni runbook da terminale.</p>
        </div>
        <Badge variant={hasToken && !isExpired ? 'success' : hasToken ? 'destructive' : 'outline'} className="shrink-0">
          {hasToken && !isExpired ? 'Attivo' : hasToken ? 'Scaduto' : 'Non configurato'}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-muted/35 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Hint</p>
          <p className="mt-1 font-mono text-sm">{isLoading ? '…' : metadata?.hint ? `…${metadata.hint}` : '—'}</p>
        </div>
        <div className="rounded-lg bg-muted/35 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Creato</p>
          <p className="mt-1 text-sm">{isLoading ? '…' : formatIsoDateTime(metadata?.createdAt ?? null)}</p>
        </div>
        <div className="rounded-lg bg-muted/35 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Ultimo uso</p>
          <p className="mt-1 text-sm">{isLoading ? '…' : formatIsoDateTime(metadata?.lastUsedAt ?? null)}</p>
        </div>
        <div className="rounded-lg bg-muted/35 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Scadenza</p>
          <p className="mt-1 text-sm">{isLoading ? '…' : formatIsoDateTime(metadata?.expiresAt ?? null)}</p>
        </div>
      </div>

      {generatedToken && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2">
            <Input readOnly value={generatedToken} className="h-9 flex-1 font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={copyGeneratedToken}>
              <Copy className="mr-1 h-4 w-4" /> Copia
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Il valore completo non sarà più recuperabile dopo aver lasciato questa pagina.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-36">
          <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
            Durata giorni
          </Label>
          <Input
            type="number"
            min={1}
            max={maxTtlDays}
            value={ttlDays}
            onChange={(event) => setTtlDays(Number(event.target.value))}
            onBlur={() => setTtlDays(clampedTtlDays)}
            disabled={isLoading || createMutation.isPending}
          />
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={isLoading || createMutation.isPending}
        >
          {createMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Terminal className="mr-1 h-4 w-4" />}
          {hasToken ? 'Ruota token' : 'Genera token'}
        </Button>
        <Button
          variant="outline"
          onClick={revoke}
          disabled={!hasToken || revokeMutation.isPending}
        >
          {revokeMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
          Revoca
        </Button>
        {metadata && (
          <span className="pb-2 text-xs text-muted-foreground">
            Default {metadata.defaultTtlDays} giorni · massimo {metadata.maxTtlDays}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ProfileHeaderCard({
  isLoading,
  hasSession,
  displayName,
  email,
  roleName,
  provider,
  isActive,
}: {
  isLoading: boolean
  hasSession: boolean
  displayName: string
  email: string
  roleName: string
  provider: string
  isActive: boolean | undefined
}) {
  const loading = isLoading || !hasSession
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-5">
        {loading ? <Skeleton className="h-20 w-20 rounded-full" /> : <Avatar name={displayName} className="h-20 w-20 text-2xl" />}
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-64" /><Skeleton className="h-5 w-24" /></div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-xs"><Shield className="mr-1 h-3 w-3" />{roleName}</Badge>
                {provider && (
                  <Badge variant="outline" className="text-xs"><KeyRound className="mr-1 h-3 w-3" />{AUTH_PROVIDER_LABELS[provider as AuthProvider] ?? provider}</Badge>
                )}
                {isActive === false && <Badge variant="destructive" className="text-xs">Disattivato</Badge>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileDetailsGrid({
  editing,
  nameValue,
  isPending,
  displayName,
  email,
  roleName,
  provider,
  createdAt,
  updatedAt,
  isLoading,
  ThemeIcon,
  theme,
  themeLabel,
  pageSize,
  sidebarCollapsed,
  filtersCollapsed,
  locale,
  onNameChange,
  onStartEditing,
  onSave,
  onCancel,
  onResetTheme,
  onResetPageSize,
  onResetSidebar,
  onResetFilters,
}: {
  editing: boolean
  nameValue: string
  isPending: boolean
  displayName: string
  email: string
  roleName: string
  provider: string
  createdAt: string | undefined
  updatedAt: string | undefined
  isLoading: boolean
  ThemeIcon: React.ElementType
  theme: string
  themeLabel: string
  pageSize: number
  sidebarCollapsed: boolean
  filtersCollapsed: boolean
  locale: string | undefined
  onNameChange: (value: string) => void
  onStartEditing: () => void
  onSave: () => void
  onCancel: () => void
  onResetTheme: () => void
  onResetPageSize: () => void
  onResetSidebar: () => void
  onResetFilters: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-6">
        <SectionTitle>Dati profilo</SectionTitle>
        <p className="mb-4 text-sm text-muted-foreground">Puoi modificare solo il tuo nome completo.</p>
        <div className="mb-2">
          <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">Nome completo</Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameValue}
                onChange={(event) => onNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSave()
                  if (event.key === 'Escape') onCancel()
                }}
                className="h-9 flex-1"
                disabled={isPending}
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={onSave} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={onCancel} disabled={isPending}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm font-medium">{displayName}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onStartEditing}><Pencil className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>
        <Separator className="my-4" />
        <div className="divide-y divide-border/60">
          <InfoRow icon={Mail} label="Email"><span className="text-muted-foreground">{email}</span></InfoRow>
          <InfoRow icon={Shield} label="Ruolo"><span className="text-muted-foreground">{roleName}</span></InfoRow>
          <InfoRow icon={KeyRound} label="Accesso tramite">
            {isLoading ? <Skeleton className="h-4 w-24" /> : <span className="text-muted-foreground">{AUTH_PROVIDER_LABELS[provider as AuthProvider] ?? provider ?? '—'}</span>}
          </InfoRow>
          <InfoRow icon={CalendarDays} label="Membro dal">
            {isLoading ? <Skeleton className="h-4 w-32" /> : <span className="text-muted-foreground">{createdAt ? formatDate(createdAt) : '—'}</span>}
          </InfoRow>
          {updatedAt && updatedAt !== createdAt && (
            <InfoRow icon={CalendarDays} label="Ultimo aggiornamento"><span className="text-muted-foreground">{formatDate(updatedAt)}</span></InfoRow>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <SectionTitle>Preferenze</SectionTitle>
        <p className="mb-4 text-sm text-muted-foreground">
          Impostazioni dell&apos;interfaccia. Usa <RotateCcw className="inline h-3 w-3 text-muted-foreground" /> per ripristinare il valore di default.
        </p>
        <div className="divide-y divide-border/60">
          <PrefRow icon={ThemeIcon} label="Tema" onReset={theme !== 'system' ? onResetTheme : undefined}><span>{themeLabel}</span></PrefRow>
          <PrefRow icon={Rows3} label="Righe per pagina" onReset={pageSize !== 10 ? onResetPageSize : undefined}><span>{pageSize} righe</span></PrefRow>
          <PrefRow icon={PanelLeft} label="Sidebar" onReset={sidebarCollapsed ? onResetSidebar : undefined}><span>{sidebarCollapsed ? 'Compressa' : 'Espansa'}</span></PrefRow>
          <PrefRow icon={SlidersHorizontal} label="Filtri analisi" onReset={!filtersCollapsed ? onResetFilters : undefined}><span>{filtersCollapsed ? 'Collassati' : 'Espansi'}</span></PrefRow>
          {locale && <PrefRow icon={Globe} label="Lingua"><span>{locale}</span></PrefRow>}
        </div>
        <Separator className="my-4" />
        <div className="rounded-lg bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">Le preferenze vengono aggiornate automaticamente mentre usi l&apos;applicazione (tema, sidebar, filtri, righe per pagina).</p>
        </div>
      </div>
    </div>
  )
}

function ProfileNotificationsCard({
  enabled,
  permission,
  supported,
  priorityLevels,
  enabledPriorityCodes,
  onToggleMaster,
  onTogglePriority,
  onRequestPermission,
}: {
  enabled: boolean
  permission: NotificationPermission
  supported: boolean
  priorityLevels: AlertPriorityLevel[]
  enabledPriorityCodes: Set<string>
  onToggleMaster: () => void | Promise<void>
  onTogglePriority: (code: string) => void | Promise<void>
  onRequestPermission: () => void | Promise<unknown>
}) {
  return (
    <div id="notifiche" className="rounded-xl border border-border bg-card p-6">
      <SectionTitle>Notifiche</SectionTitle>
      <p className="mb-5 text-sm text-muted-foreground">Ricevi notifiche browser in tempo reale per eventi importanti, anche quando sei su un&apos;altra pagina.</p>
      <div className={cn('rounded-lg border p-4 transition-colors', enabled ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-muted/20')}>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors', enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
            {enabled ? <Bell className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{enabled ? 'Notifiche attive' : 'Notifiche disattivate'}</p>
            {enabled && <p className="mt-0.5 text-xs text-muted-foreground">Il supervisore monitora gli allarmi ogni 30 secondi</p>}
          </div>
          <button
            type="button"
            onClick={() => { void onToggleMaster() }}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
              enabled ? 'border-primary bg-primary dark:border-blue-600 dark:bg-blue-600' : 'border-zinc-300 bg-zinc-300 dark:border-zinc-500 dark:bg-zinc-600',
            )}
          >
            <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </div>

        {enabled && (
          <div className={cn(
            'mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs',
            permission === 'granted'
              ? 'bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
              : permission === 'denied'
                ? 'bg-amber-500/5 text-amber-700 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
          )}>
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', permission === 'granted' ? 'bg-emerald-500' : permission === 'denied' ? 'bg-amber-500' : 'bg-muted-foreground/50')} />
            <span className="flex-1">
              {permission === 'granted' && 'Permesso browser concesso — le notifiche verranno inviate'}
              {permission === 'denied' && <>Permesso browser negato — clicca sull&apos;icona lucchetto (o scudo) nella barra indirizzi, apri &quot;Impostazioni sito&quot; e imposta Notifiche su &quot;Consenti&quot;, poi ricarica la pagina.</>}
              {permission === 'default' && 'Permesso non ancora richiesto — verrà chiesto al primo evento'}
            </span>
            {permission === 'granted' ? (
              <button
                type="button"
                className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => new Notification('Watchtower — Test notifica', { body: 'Le notifiche browser funzionano correttamente.', tag: 'watchtower-test', icon: '/logo1.png' })}
              >Invia test</button>
            ) : (
              <button
                type="button"
                className={cn('shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors', permission === 'denied' ? 'text-amber-700 hover:bg-amber-500/10 dark:text-amber-400' : 'hover:bg-black/5 dark:hover:bg-white/5')}
                onClick={() => { void onRequestPermission() }}
              >Richiedi permesso</button>
            )}
          </div>
        )}
      </div>

      {enabled && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">Allarmi scattati</p>
            <div className="space-y-1">
              {[...priorityLevels].filter((level) => level.isActive).sort((a, b) => b.rank - a.rank).map((level) => {
                const isOn = enabledPriorityCodes.has(level.code)
                return (
                  <div
                    key={level.code}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
                      isOn ? 'border-primary/15 bg-primary/[0.02] hover:bg-primary/[0.04]' : 'border-transparent bg-muted/30 opacity-60 hover:bg-muted/50',
                    )}
                    onClick={() => { void onTogglePriority(level.code) }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{level.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Codice {level.code}{level.countsAsOnCall ? ' · conta come on-call' : ''}{level.defaultNotify ? ' · attiva di default' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors', isOn ? 'border-primary bg-primary dark:border-blue-600 dark:bg-blue-600' : 'border-zinc-300 bg-zinc-300 dark:border-zinc-500 dark:bg-zinc-600')}
                      tabIndex={-1}
                    >
                      <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow-lg transition-transform', isOn ? 'translate-x-[18px]' : 'translate-x-0.5')} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {!supported && (
        <><Separator className="my-4" /><div className="rounded-lg bg-muted/40 px-4 py-3"><p className="text-xs text-muted-foreground">Il browser in uso non supporta le notifiche.</p></div></>
      )}
    </div>
  )
}

function ProfileColumnSettingsCard({
  entries,
  expandedLists,
  onToggle,
  onResetAll,
  onResetWidth,
  onResetRename,
}: {
  entries: [string, ColumnSettings][]
  expandedLists: Set<string>
  onToggle: (listKey: string) => void
  onResetAll: (listKey: string) => void
  onResetWidth: (listKey: string, columnId: string) => void
  onResetRename: (listKey: string, columnId: string) => void
}) {
  if (!entries.length) return null

  return (
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
        {entries.map(([listKey, settings]) => {
          const isExpanded = expandedLists.has(listKey)
          const definitions = COLUMN_REGISTRY[listKey]
          const overrideCount = definitions ? buildColumnStates(settings, definitions).filter((column) => column.hasAnyOverride).length : 0
          return (
            <div key={listKey} className="overflow-hidden rounded-lg border border-border">
              <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-3">
                <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => onToggle(listKey)}>
                  {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="text-sm font-semibold">{LIST_LABELS[listKey] ?? listKey}</span>
                  {overrideCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">{overrideCount} personalizzate</span>
                  )}
                </button>
                <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 text-xs" onClick={() => onResetAll(listKey)}>
                  <RotateCcw className="h-3 w-3" />Ripristina tutto
                </Button>
              </div>
              {isExpanded && (
                <div className="border-t border-border p-4">
                  <ColumnSettingsDetail
                    listKey={listKey}
                    settings={settings}
                    onResetWidth={(columnId) => onResetWidth(listKey, columnId)}
                    onResetRename={(columnId) => onResetRename(listKey, columnId)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

      <ProfileHeaderCard
        isLoading={isLoading}
        hasSession={Boolean(session)}
        displayName={displayName}
        email={email}
        roleName={roleName}
        provider={provider}
        isActive={userDetail?.isActive}
      />

      <ProfileDetailsGrid
        editing={editing}
        nameValue={nameValue}
        isPending={isPending}
        displayName={displayName}
        email={email}
        roleName={roleName}
        provider={provider}
        createdAt={createdAt}
        updatedAt={updatedAt}
        isLoading={isLoading}
        ThemeIcon={ThemeIcon}
        theme={theme}
        themeLabel={themeLabel}
        pageSize={pageSize}
        sidebarCollapsed={sidebarCollapsed}
        filtersCollapsed={filtersCollapsed}
        locale={preferences.locale}
        onNameChange={setNameValue}
        onStartEditing={() => setEditing(true)}
        onSave={handleSave}
        onCancel={handleCancel}
        onResetTheme={handleResetTheme}
        onResetPageSize={handleResetPageSize}
        onResetSidebar={handleResetSidebar}
        onResetFilters={handleResetFilters}
      />

      <CliTokenSection />

      <ProfileNotificationsCard
        enabled={notifEnabled}
        permission={notifPermission}
        supported={notifSupported}
        priorityLevels={priorityLevels}
        enabledPriorityCodes={enabledPriorityCodes}
        onToggleMaster={handleToggleNotifMaster}
        onTogglePriority={handleTogglePriorityCode}
        onRequestPermission={requestNotifPermission}
      />

      <ProfileColumnSettingsCard
        entries={columnSettingsEntries}
        expandedLists={expandedLists}
        onToggle={toggleExpand}
        onResetAll={handleResetAllColumns}
        onResetWidth={handleResetColumnWidth}
        onResetRename={handleResetColumnRename}
      />
    </div>
  )
}

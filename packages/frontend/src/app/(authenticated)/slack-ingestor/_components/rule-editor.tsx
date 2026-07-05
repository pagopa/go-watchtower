'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Globe,
  GripVertical,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SlackIngestorAutomationRule, SlackIngestorRuleEffect, SlackIngestorControlWarning } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  DIMENSION_META,
  MATCHER_DIMENSIONS,
  RULE_EFFECT_META,
  DEFAULT_EFFECT_META,
  RUNBOOK_KIND_META,
  type MatcherDimension,
} from './labels'
import { RichSelect } from './rich-select'
import { TagInput } from './tag-input'

const QUICK_DENY_PREFIX = 'quick-deny:'

export interface OptionItem {
  value: string
  label: string
  /** Presente per ambienti e allarmi: consente di filtrare per i prodotti della regola. */
  productId?: string
}

export interface RuleEditorSources {
  products: OptionItem[]
  environments: OptionItem[]
  alarms: OptionItem[]
  channels: OptionItem[]
  runbooks: OptionItem[]
  runbookCategories: OptionItem[]
  priorities: OptionItem[]
  alarmNameSuggestions: string[]
  awsRegionSuggestions: string[]
  awsAccountSuggestions: string[]
}

interface RuleEditorProps {
  rules: SlackIngestorAutomationRule[]
  onChange: (rules: SlackIngestorAutomationRule[]) => void
  defaultRuleEffect: SlackIngestorRuleEffect
  onDefaultRuleEffectChange: (effect: SlackIngestorRuleEffect) => void
  sources: RuleEditorSources
  warnings: SlackIngestorControlWarning[]
  disabled?: boolean
}

export function isQuickRule(rule: SlackIngestorAutomationRule): boolean {
  return rule.id.startsWith(QUICK_DENY_PREFIX)
}

export function isGlobalRule(rule: SlackIngestorAutomationRule): boolean {
  return Object.values(rule.matcher).every((values) => !values || values.length === 0)
}

function newRule(): SlackIngestorAutomationRule {
  return {
    id: `rule-${crypto.randomUUID().slice(0, 8)}`,
    name: '',
    enabled: true,
    effect: 'ALLOW',
    matcher: {},
  }
}

/** Aggiunge ai valori selezionati non presenti tra le opzioni una voce visibile, così restano rimovibili. */
function withUnknown(options: OptionItem[], selected: string[]): OptionItem[] {
  const known = new Set(options.map((option) => option.value))
  const missing = selected.filter((value) => !known.has(value))
  if (missing.length === 0) return options
  return [...options, ...missing.map((value) => ({ value, label: `${value} (non trovato)` }))]
}

function filterByProducts(options: OptionItem[], productIds: string[] | undefined): OptionItem[] {
  if (!productIds || productIds.length === 0) return options
  const allowed = new Set(productIds)
  return options.filter((option) => !option.productId || allowed.has(option.productId))
}

const RUNBOOK_KIND_OPTIONS: OptionItem[] = Object.entries(RUNBOOK_KIND_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}))

// ─── Valori di una condizione ─────────────────────────────────────────────────

function ConditionValues({
  dimension,
  rule,
  sources,
  disabled,
  onValuesChange,
}: {
  dimension: MatcherDimension
  rule: SlackIngestorAutomationRule
  sources: RuleEditorSources
  disabled: boolean
  onValuesChange: (values: string[]) => void
}) {
  const values = rule.matcher[dimension] ?? []
  const combobox = (options: OptionItem[]) => (
    <MultiSelectCombobox
      options={withUnknown(options, values)}
      value={values}
      onValueChange={onValuesChange}
      disabled={disabled}
      placeholder={`Seleziona ${DIMENSION_META[dimension].label.toLowerCase()}…`}
    />
  )

  switch (dimension) {
    case 'productIds':
      return combobox(sources.products)
    case 'environmentIds':
      return combobox(filterByProducts(sources.environments, rule.matcher.productIds))
    case 'alarmIds':
      return combobox(filterByProducts(sources.alarms, rule.matcher.productIds))
    case 'channelIds':
      return combobox(sources.channels)
    case 'runbookKeys':
      return combobox(sources.runbooks)
    case 'runbookKinds':
      return combobox(RUNBOOK_KIND_OPTIONS)
    case 'runbookCategories':
      return combobox(sources.runbookCategories)
    case 'priorityCodes':
      return combobox(sources.priorities)
    case 'alarmNames':
      return (
        <TagInput
          value={values}
          onValueChange={onValuesChange}
          disabled={disabled}
          placeholder="Nome esatto dell’allarme CloudWatch, Invio per aggiungere"
          suggestions={sources.alarmNameSuggestions}
        />
      )
    case 'awsRegions':
      return (
        <TagInput
          value={values}
          onValueChange={onValuesChange}
          disabled={disabled}
          placeholder="es. eu-south-1, Invio per aggiungere"
          suggestions={sources.awsRegionSuggestions}
        />
      )
    case 'awsAccountIds':
      return (
        <TagInput
          value={values}
          onValueChange={onValuesChange}
          disabled={disabled}
          placeholder="ID account a 12 cifre, Invio per aggiungere"
          suggestions={sources.awsAccountSuggestions}
        />
      )
  }
}

// ─── Riepilogo condizioni (chips nella riga compressa) ────────────────────────

function MatcherSummary({ rule, sources }: { rule: SlackIngestorAutomationRule; sources: RuleEditorSources }) {
  const lookups: Partial<Record<MatcherDimension, OptionItem[]>> = {
    productIds: sources.products,
    environmentIds: sources.environments,
    alarmIds: sources.alarms,
    channelIds: sources.channels,
    runbookKeys: sources.runbooks,
    runbookKinds: RUNBOOK_KIND_OPTIONS,
    runbookCategories: sources.runbookCategories,
    priorityCodes: sources.priorities,
  }

  if (isGlobalRule(rule)) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-500">
        <Globe className="h-3 w-3" />
        Globale: tutti gli eventi
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {MATCHER_DIMENSIONS.flatMap((dimension) => {
        const values = rule.matcher[dimension]
        if (!values || values.length === 0) return []
        const options = lookups[dimension]
        const first = options?.find((option) => option.value === values[0])?.label ?? values[0]
        const text = values.length === 1 ? first : `${values.length} valori`
        return [
          <Badge key={dimension} variant="secondary" className="max-w-[220px] font-normal">
            <span className="truncate">
              {DIMENSION_META[dimension].label}: {text}
            </span>
          </Badge>,
        ]
      })}
    </div>
  )
}

// ─── Scheda regola ────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  position,
  isFirst,
  isLast,
  expanded,
  sources,
  ruleWarnings,
  disabled,
  onToggleExpand,
  onChange,
  onRemove,
  onMove,
  handleDragProps,
  dropZoneProps,
  dropTarget,
}: {
  rule: SlackIngestorAutomationRule
  position: number
  isFirst: boolean
  isLast: boolean
  expanded: boolean
  sources: RuleEditorSources
  ruleWarnings: SlackIngestorControlWarning[]
  disabled: boolean
  onToggleExpand: () => void
  onChange: (rule: SlackIngestorAutomationRule) => void
  onRemove: () => void
  onMove: (delta: 1 | -1) => void
  /** Spread sulla maniglia: solo da lì si può iniziare il trascinamento. */
  handleDragProps?: React.HTMLAttributes<HTMLSpanElement>
  /** Spread sulla card: la rende bersaglio di rilascio. */
  dropZoneProps?: React.HTMLAttributes<HTMLDivElement>
  dropTarget?: boolean
}) {
  const quick = isQuickRule(rule)
  const effectMeta = RULE_EFFECT_META[rule.effect]
  // Dimensioni attive: quelle valorizzate nel matcher + quelle appena aggiunte (ancora vuote)
  const [pendingDims, setPendingDims] = useState<MatcherDimension[]>([])
  const activeDims = MATCHER_DIMENSIONS.filter(
    (dimension) => (rule.matcher[dimension]?.length ?? 0) > 0 || pendingDims.includes(dimension)
  )
  const availableDims = MATCHER_DIMENSIONS.filter((dimension) => !activeDims.includes(dimension))

  const setValues = (dimension: MatcherDimension, values: string[]) => {
    const matcher = { ...rule.matcher }
    if (values.length === 0) {
      delete matcher[dimension]
      if (!pendingDims.includes(dimension)) setPendingDims([...pendingDims, dimension])
    } else {
      matcher[dimension] = values as never
      setPendingDims(pendingDims.filter((pending) => pending !== dimension))
    }
    onChange({ ...rule, matcher })
  }

  const removeCondition = (dimension: MatcherDimension) => {
    const matcher = { ...rule.matcher }
    delete matcher[dimension]
    setPendingDims(pendingDims.filter((pending) => pending !== dimension))
    onChange({ ...rule, matcher })
  }

  return (
    <div
      {...(quick || disabled ? {} : dropZoneProps)}
      className={cn(
        'rounded-lg border border-l-4 bg-card transition-shadow',
        rule.effect === 'ALLOW' ? 'border-l-emerald-500' : 'border-l-rose-500',
        !rule.enabled && 'border-l-muted-foreground/30 opacity-60',
        dropTarget && 'ring-2 ring-ring ring-offset-2'
      )}
    >
      {/* Riga compressa */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {quick ? (
          <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Regola gestita dal catalogo" />
        ) : (
          <span
            {...(disabled ? {} : handleDragProps)}
            className={cn('shrink-0', !disabled && 'cursor-grab active:cursor-grabbing')}
            aria-label="Trascina per riordinare"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/60" />
          </span>
        )}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted font-mono text-xs font-semibold">
          {position}
        </span>
        <Switch
          checked={rule.enabled}
          disabled={disabled || quick}
          onCheckedChange={(checked) => onChange({ ...rule, enabled: checked })}
          aria-label="Regola abilitata"
        />
        <Badge variant={effectMeta.variant} className="shrink-0">{effectMeta.label}</Badge>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-medium', !rule.name.trim() && 'italic text-muted-foreground')}>
            {rule.name.trim() || 'Regola senza nome'}
          </p>
          <div className="mt-1 hidden md:block">
            <MatcherSummary rule={rule} sources={sources} />
          </div>
        </div>
        {!quick && !disabled && (
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Sposta su">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={isLast} onClick={() => onMove(1)} aria-label="Sposta giù">
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label="Elimina regola">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        {quick && !disabled && (
          <Button variant="ghost" size="sm" className="h-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="mr-1 h-4 w-4" />
            Rimuovi
          </Button>
        )}
        {!quick && (
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onToggleExpand} aria-label={expanded ? 'Comprimi' : 'Modifica'} aria-expanded={expanded}>
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </Button>
        )}
      </div>

      {ruleWarnings.length > 0 && (
        <div className="mx-3 mb-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {ruleWarnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>{warning.message}</p>
          ))}
        </div>
      )}

      {/* Editor espanso */}
      {expanded && !quick && (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_240px]">
            <div className="space-y-1.5">
              <Label htmlFor={`rule-name-${rule.id}`}>Nome</Label>
              <Input
                id={`rule-name-${rule.id}`}
                value={rule.name}
                disabled={disabled}
                placeholder="es. Solo produzione IO"
                className={cn(!rule.name.trim() && 'border-destructive')}
                onChange={(event) => onChange({ ...rule, name: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`rule-description-${rule.id}`}>Descrizione (opzionale)</Label>
              <Input
                id={`rule-description-${rule.id}`}
                value={rule.description ?? ''}
                disabled={disabled}
                placeholder="Perché esiste questa regola"
                onChange={(event) => onChange({ ...rule, description: event.target.value || undefined })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Effetto</Label>
              <RichSelect
                value={rule.effect}
                disabled={disabled}
                options={(['ALLOW', 'DENY'] as const).map((effect) => ({
                  value: effect,
                  label: RULE_EFFECT_META[effect].label,
                  description: RULE_EFFECT_META[effect].description,
                }))}
                onValueChange={(effect) => onChange({ ...rule, effect })}
                renderValuePrefix={(effect) => (
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', effect === 'ALLOW' ? 'bg-emerald-500' : 'bg-rose-500')} />
                )}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Condizioni</p>
              <p className="text-xs text-muted-foreground">
                La regola scatta se tutte le condizioni sono soddisfatte; dentro una condizione basta uno dei valori.
              </p>
            </div>

            {activeDims.length === 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p>
                  <span className="font-medium">Nessuna condizione: la regola è globale</span> e corrisponde a ogni
                  evento. Il salvataggio chiederà una conferma esplicita.
                </p>
              </div>
            )}

            {activeDims.map((dimension) => (
              <div key={dimension} className="grid items-start gap-2 md:grid-cols-[220px_1fr_36px]">
                <div className="pt-2.5">
                  <p className="text-sm font-medium">{DIMENSION_META[dimension].label}</p>
                  <p className="text-xs text-muted-foreground">{DIMENSION_META[dimension].description}</p>
                </div>
                <ConditionValues
                  dimension={dimension}
                  rule={rule}
                  sources={sources}
                  disabled={disabled}
                  onValuesChange={(values) => setValues(dimension, values)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCondition(dimension)}
                  aria-label={`Rimuovi condizione ${DIMENSION_META[dimension].label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {availableDims.length > 0 && !disabled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi condizione
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[340px]">
                  {availableDims.map((dimension) => (
                    <DropdownMenuItem
                      key={dimension}
                      className="items-start py-2"
                      onSelect={() => setPendingDims([...pendingDims, dimension])}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{DIMENSION_META[dimension].label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {DIMENSION_META[dimension].description}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Editor lista regole ──────────────────────────────────────────────────────

function Connector() {
  return <div className="mx-auto h-3 w-px bg-border" aria-hidden />
}

export function RuleEditor({
  rules,
  onChange,
  defaultRuleEffect,
  onDefaultRuleEffectChange,
  sources,
  warnings,
  disabled = false,
}: RuleEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const quickRules = useMemo(() => rules.filter(isQuickRule), [rules])
  const manualRules = useMemo(() => rules.filter((rule) => !isQuickRule(rule)), [rules])

  const commit = (nextManual: SlackIngestorAutomationRule[]) => {
    // Le quick exclusion devono sempre precedere le regole manuali
    onChange([...quickRules, ...nextManual])
  }

  const updateManual = (index: number, rule: SlackIngestorAutomationRule) => {
    commit(manualRules.map((current, i) => (i === index ? rule : current)))
  }

  const moveManual = (index: number, delta: 1 | -1) => {
    const target = index + delta
    if (target < 0 || target >= manualRules.length) return
    const next = [...manualRules]
    ;[next[index], next[target]] = [next[target], next[index]]
    commit(next)
  }

  const reorderManual = (from: number, to: number) => {
    if (from === to) return
    const next = [...manualRules]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  const addRule = () => {
    const rule = newRule()
    commit([...manualRules, rule])
    setExpandedId(rule.id)
  }

  const warningsFor = (ruleId: string) => warnings.filter((warning) => warning.ruleId === ruleId)

  return (
    <div className="space-y-0">
      {/* Nodo di ingresso della pipeline */}
      <div className="flex justify-center">
        <span className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Evento allarme con runbook disponibile
        </span>
      </div>
      <Connector />

      {quickRules.length > 0 && (
        <div className="space-y-0">
          <div className="space-y-2 rounded-lg border border-dashed p-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              Esclusioni rapide — create dal catalogo runbook, valutate per prime e sempre bloccanti
            </p>
            {quickRules.map((rule, index) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                position={index + 1}
                isFirst
                isLast
                expanded={false}
                sources={sources}
                ruleWarnings={warningsFor(rule.id)}
                disabled={disabled}
                onToggleExpand={() => undefined}
                onChange={() => undefined}
                onRemove={() => onChange(rules.filter((current) => current.id !== rule.id))}
                onMove={() => undefined}
              />
            ))}
          </div>
          <Connector />
        </div>
      )}

      {manualRules.map((rule, index) => (
        <div key={rule.id}>
          <RuleCard
            rule={rule}
            position={quickRules.length + index + 1}
            isFirst={index === 0}
            isLast={index === manualRules.length - 1}
            expanded={expandedId === rule.id}
            sources={sources}
            ruleWarnings={warningsFor(rule.id)}
            disabled={disabled}
            onToggleExpand={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
            onChange={(next) => updateManual(index, next)}
            onRemove={() => commit(manualRules.filter((_, i) => i !== index))}
            onMove={(delta) => moveManual(index, delta)}
            dropTarget={dropIndex === index && dragIndex !== null && dragIndex !== index}
            handleDragProps={{
              draggable: true,
              onDragStart: (event) => {
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
              },
              onDragEnd: () => {
                setDragIndex(null)
                setDropIndex(null)
              },
            }}
            dropZoneProps={{
              onDragOver: (event) => {
                if (dragIndex === null) return
                event.preventDefault()
                setDropIndex(index)
              },
              onDrop: (event) => {
                event.preventDefault()
                if (dragIndex !== null) reorderManual(dragIndex, index)
                setDragIndex(null)
                setDropIndex(null)
              },
            }}
          />
          <Connector />
        </div>
      ))}

      {manualRules.length === 0 && (
        <>
          <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Nessuna regola manuale: ogni evento ricade sul comportamento predefinito qui sotto.
          </div>
          <Connector />
        </>
      )}

      {!disabled && (
        <>
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={addRule}>
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi regola
            </Button>
          </div>
          <Connector />
        </>
      )}

      {/* Nodo terminale: comportamento predefinito */}
      <div
        className={cn(
          'flex flex-col gap-3 rounded-lg border border-l-4 bg-muted/40 px-4 py-3 md:flex-row md:items-center',
          defaultRuleEffect === 'ALLOW' ? 'border-l-emerald-500' : 'border-l-rose-500'
        )}
      >
        <div className="flex-1">
          <p className="text-sm font-medium">Se nessuna regola corrisponde</p>
          <p className="text-xs text-muted-foreground">{DEFAULT_EFFECT_META[defaultRuleEffect].description}</p>
        </div>
        <div className="w-full md:w-[240px]">
          <RichSelect
            value={defaultRuleEffect}
            disabled={disabled}
            options={(['DENY', 'ALLOW'] as const).map((effect) => ({
              value: effect,
              label: DEFAULT_EFFECT_META[effect].label,
              description: DEFAULT_EFFECT_META[effect].description,
            }))}
            onValueChange={onDefaultRuleEffectChange}
            renderValuePrefix={(effect) => (
              <span className={cn('h-2 w-2 shrink-0 rounded-full', effect === 'ALLOW' ? 'bg-emerald-500' : 'bg-rose-500')} />
            )}
          />
        </div>
      </div>
    </div>
  )
}

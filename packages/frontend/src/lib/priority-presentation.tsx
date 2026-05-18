import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BellRing,
  Cloud,
  FileSearch,
  Flag,
  Flame,
  Info,
  Minus,
  PhoneCall,
  Siren,
  Zap,
} from 'lucide-react'

export interface PriorityColorOption {
  value: string
  label: string
  description: string
  dotClassName: string
}

export interface PriorityIconOption {
  value: string
  label: string
  description: string
  Icon: LucideIcon
}

export const PRIORITY_COLOR_OPTIONS: PriorityColorOption[] = [
  {
    value: 'zinc',
    label: 'Neutro',
    description: 'Default discreto e leggibile',
    dotClassName: 'bg-zinc-500',
  },
  {
    value: 'red',
    label: 'Rosso',
    description: 'Criticita massima',
    dotClassName: 'bg-red-500',
  },
  {
    value: 'orange',
    label: 'Arancione',
    description: 'Escalation rapida',
    dotClassName: 'bg-orange-500',
  },
  {
    value: 'amber',
    label: 'Ambra',
    description: 'Alta attenzione',
    dotClassName: 'bg-amber-500',
  },
  {
    value: 'yellow',
    label: 'Giallo',
    description: 'Da monitorare',
    dotClassName: 'bg-yellow-500',
  },
  {
    value: 'emerald',
    label: 'Emeraldo',
    description: 'Gestione strutturata',
    dotClassName: 'bg-emerald-500',
  },
  {
    value: 'sky',
    label: 'Cielo',
    description: 'Segnale informativo',
    dotClassName: 'bg-sky-500',
  },
  {
    value: 'blue',
    label: 'Blu',
    description: 'Operativita standard',
    dotClassName: 'bg-blue-500',
  },
  {
    value: 'violet',
    label: 'Viola',
    description: 'Contesto tecnico dedicato',
    dotClassName: 'bg-violet-500',
  },
  {
    value: 'rose',
    label: 'Rosa',
    description: 'Canale ad alta visibilita',
    dotClassName: 'bg-rose-500',
  },
]

export const PRIORITY_ICON_OPTIONS: PriorityIconOption[] = [
  {
    value: 'minus',
    label: 'Neutra',
    description: 'Badge essenziale, senza enfasi',
    Icon: Minus,
  },
  {
    value: 'flag',
    label: 'Flag',
    description: 'Livello operativo generico',
    Icon: Flag,
  },
  {
    value: 'bell',
    label: 'Campana',
    description: 'Allarme da presidiare',
    Icon: BellRing,
  },
  {
    value: 'phone',
    label: 'Telefono',
    description: 'Reperibilita o contatto diretto',
    Icon: PhoneCall,
  },
  {
    value: 'siren',
    label: 'Sirena',
    description: 'Escalation urgente',
    Icon: Siren,
  },
  {
    value: 'alert-triangle',
    label: 'Warning',
    description: 'Anomalia da gestire con attenzione',
    Icon: AlertTriangle,
  },
  {
    value: 'alert-circle',
    label: 'Alert',
    description: 'Problema aperto da seguire',
    Icon: AlertCircle,
  },
  {
    value: 'flame',
    label: 'Flame',
    description: 'Situazione calda o prioritaria',
    Icon: Flame,
  },
  {
    value: 'activity',
    label: 'Attivita',
    description: 'Segnale tecnico o telemetria',
    Icon: Activity,
  },
  {
    value: 'zap',
    label: 'Zap',
    description: 'Evento rapido o impattante',
    Icon: Zap,
  },
  {
    value: 'cloud',
    label: 'Cloud',
    description: 'Contesto infrastrutturale',
    Icon: Cloud,
  },
  {
    value: 'file-search',
    label: 'Analisi',
    description: 'Da investigare o approfondire',
    Icon: FileSearch,
  },
  {
    value: 'info',
    label: 'Info',
    description: 'Livello informativo',
    Icon: Info,
  },
]

const PRIORITY_BADGE_CLASS_BY_COLOR: Record<string, string> = {
  zinc: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  slate: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  gray: 'border-gray-500/20 bg-gray-500/10 text-gray-700 dark:text-gray-300',
  neutral: 'border-neutral-500/20 bg-neutral-500/10 text-neutral-700 dark:text-neutral-300',
  stone: 'border-stone-500/20 bg-stone-500/10 text-stone-700 dark:text-stone-300',
  red: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400',
  orange: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  yellow: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  lime: 'border-lime-500/20 bg-lime-500/10 text-lime-700 dark:text-lime-400',
  green: 'border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  teal: 'border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  blue: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  violet: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400',
  purple: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  fuchsia: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400',
  pink: 'border-pink-500/20 bg-pink-500/10 text-pink-700 dark:text-pink-400',
  rose: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400',
}

const PRIORITY_ICON_BY_TOKEN = PRIORITY_ICON_OPTIONS.reduce<Record<string, LucideIcon>>(
  (acc, option) => {
    acc[option.value] = option.Icon
    return acc
  },
  {}
)

export function normalizePriorityToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function getPriorityBadgeClass(color: string | null | undefined): string {
  const normalizedColor = normalizePriorityToken(color)

  if (!normalizedColor) {
    return PRIORITY_BADGE_CLASS_BY_COLOR.zinc
  }

  return PRIORITY_BADGE_CLASS_BY_COLOR[normalizedColor] ?? PRIORITY_BADGE_CLASS_BY_COLOR.zinc
}

export function getPriorityColorOption(
  color: string | null | undefined
): PriorityColorOption | null {
  const normalizedColor = normalizePriorityToken(color)
  return PRIORITY_COLOR_OPTIONS.find((option) => option.value === normalizedColor) ?? null
}

export function getPriorityIcon(icon: string | null | undefined): LucideIcon {
  const normalizedIcon = normalizePriorityToken(icon)

  if (!normalizedIcon) {
    return Minus
  }

  return PRIORITY_ICON_BY_TOKEN[normalizedIcon] ?? Flag
}

export function getPriorityIconOption(
  icon: string | null | undefined
): PriorityIconOption | null {
  const normalizedIcon = normalizePriorityToken(icon)
  return PRIORITY_ICON_OPTIONS.find((option) => option.value === normalizedIcon) ?? null
}

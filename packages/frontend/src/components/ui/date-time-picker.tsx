'use client'

import * as React from 'react'
import { CalendarIcon, ChevronDown, ChevronUp, Clock, X } from 'lucide-react'
import { format, parse } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { cn } from '@/lib/utils'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'

// ─── Mask config ──────────────────────────────────────────────────────────────
//
//  dateOnly:  __/__/____          (10 chars, 8 digit slots)
//  datetime:  __/__/____ __:__   (16 chars, 12 digit slots)
//
//  Slot index → display position:
//    dateOnly : [0,1,3,4,6,7,8,9]
//    datetime : [0,1,3,4,6,7,8,9,11,12,14,15]

const SLOTS_DATE = [0, 1, 3, 4, 6, 7, 8, 9] as const
const SLOTS_DATETIME = [0, 1, 3, 4, 6, 7, 8, 9, 11, 12, 14, 15] as const
const SEPS_DATE: Record<number, string> = { 2: '/', 5: '/' }
const SEPS_DATETIME: Record<number, string> = { 2: '/', 5: '/', 10: ' ', 13: ':' }

type SlotArray = readonly number[]

function cfg(dateOnly: boolean): { slots: SlotArray; seps: Record<number, string>; len: number; numSlots: number } {
  return dateOnly
    ? { slots: SLOTS_DATE, seps: SEPS_DATE, len: 10, numSlots: 8 }
    : { slots: SLOTS_DATETIME, seps: SEPS_DATETIME, len: 16, numSlots: 12 }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function buildDisplay(digits: string[], dateOnly: boolean): string {
  const { slots, seps, len } = cfg(dateOnly)
  const chars: string[] = Array(len).fill('_')
  Object.entries(seps).forEach(([p, s]) => { chars[Number(p)] = s })
  slots.forEach((pos, i) => { if (digits[i]) chars[pos] = digits[i] })
  return chars.join('')
}

function valueToDigits(value: string, dateOnly: boolean): string[] {
  const { numSlots } = cfg(dateOnly)
  const d = Array<string>(numSlots).fill('')
  if (!value) return d
  const [datePart = '', timePart = ''] = value.split('T')
  const [year = '', month = '', day = ''] = datePart.split('-')
  if (day.length >= 2) { d[0] = day[0]; d[1] = day[1] }
  if (month.length >= 2) { d[2] = month[0]; d[3] = month[1] }
  if (year.length >= 4) { d[4] = year[0]; d[5] = year[1]; d[6] = year[2]; d[7] = year[3] }
  if (!dateOnly && timePart) {
    const [h = '', m = ''] = timePart.split(':')
    if (h.length >= 2) { d[8] = h[0]; d[9] = h[1] }
    if (m.length >= 2) { d[10] = m[0]; d[11] = m[1] }
  }
  return d
}

function digitsToValue(digits: string[], dateOnly: boolean): string {
  const { numSlots } = cfg(dateOnly)
  if (digits.slice(0, numSlots).some((c) => !c)) return ''
  const [d0, d1, m0, m1, y0, y1, y2, y3, h0, h1, min0, min1] = digits
  const dd = `${d0}${d1}`, mm = `${m0}${m1}`, yyyy = `${y0}${y1}${y2}${y3}`
  if (dateOnly) return `${yyyy}-${mm}-${dd}`
  return `${yyyy}-${mm}-${dd}T${h0}${h1}:${min0}${min1}`
}

// ─── Date parsing (for paste) ─────────────────────────────────────────────────
//
// Supported paste formats (most-specific → least-specific):
//
//   28/02/2026 08:00:55     dd/MM/yyyy HH:mm:ss
//   28/02/2026 08.00.55     dd/MM/yyyy HH.mm.ss  (dots as time separators)
//   28/02/2026 08:00        dd/MM/yyyy HH:mm
//   28/02/2026 08.00        dd/MM/yyyy HH.mm      (dots as time separators)
//   28/02/2026              dd/MM/yyyy             (date only)
//   2026-02-02T08:00:55.550Z  ISO 8601 full (with Z or offset → UTC-aware)
//   2026-02-02T08:00:55+01:00 ISO 8601 with offset
//   2026-02-02T08:00:55     ISO local with seconds
//   2026-02-02T08:00        ISO local without seconds
//   2026-02-02              ISO date only (treated as local, NOT UTC)

/** True when the ISO string contains timezone info (Z or +/-offset). */
function hasTimezoneInfo(text: string): boolean {
  // Match trailing Z, or +HH:mm / -HH:mm / +HHmm / -HHmm after the time part
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
}

/**
 * Normalise dot-separated time components to colon-separated.
 * Only operates on the TIME portion — the date part is left untouched.
 *
 * "28/02/2026 08.00.55" → "28/02/2026 08:00:55"
 * "28/02/2026 08.00"    → "28/02/2026 08:00"
 */
function normaliseDotTime(text: string): string {
  // Match: <date-part><space><HH>.<mm> with optional .<ss>
  return text.replace(
    /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2})\.(\d{2})(?:\.(\d{2}))?$/,
    (_match, datePart: string, hh: string, mm: string, ss: string | undefined) =>
      ss ? `${datePart} ${hh}:${mm}:${ss}` : `${datePart} ${hh}:${mm}`,
  )
}

function tryParseDate(text: string): Date | null {
  if (!text) return null

  const trimmed = text.trim()

  // ── 1. ISO-like strings (start with yyyy-MM-dd) ──────────────────────────
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    // 1a. Has timezone info (Z or offset) → native Date handles UTC conversion
    //     to browser-local time correctly.
    if (hasTimezoneInfo(trimmed)) {
      const d = new Date(trimmed)
      return isNaN(d.getTime()) ? null : d
    }

    // 1b. ISO date-only "yyyy-MM-dd" — parse manually to avoid the native
    //     Date constructor treating it as UTC midnight (which shifts the date
    //     backwards in UTC+ timezones).
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch
      const local = new Date(Number(y), Number(m) - 1, Number(d))
      return isNaN(local.getTime()) ? null : local
    }

    // 1c. ISO local datetime "yyyy-MM-ddTHH:mm" or "yyyy-MM-ddTHH:mm:ss"
    //     Without Z / offset, `new Date()` treats it as local — which is
    //     exactly the behaviour we want.
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? null : d
  }

  // ── 2. Italian / European formats (dd/MM/yyyy ...) ────────────────────────

  // Normalise dot-separated time to colons before parsing.
  const normalised = normaliseDotTime(trimmed)

  // Try from most-specific to least-specific.
  const itFormats = [
    'dd/MM/yyyy HH:mm:ss',   // 28/02/2026 08:00:55
    'dd/MM/yyyy HH:mm',      // 28/02/2026 08:00
    'dd/MM/yyyy',             // 28/02/2026
  ] as const

  for (const fmt of itFormats) {
    const parsed = parse(normalised, fmt, new Date())
    if (!isNaN(parsed.getTime())) return parsed
  }

  return null
}

// ─── TimeSpinner ──────────────────────────────────────────────────────────────

const spinnerBtn =
  'flex h-6 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent/80'

interface TimeSpinnerProps {
  hours: number
  minutes: number
  onAdjust: (hDelta: number, mDelta: number) => void
}

function TimeSpinner({ hours, minutes, onAdjust }: TimeSpinnerProps) {
  return (
    <div className="border-t px-3 py-2.5">
      <div className="flex items-center justify-center gap-3">
        <span className="mr-1 text-xs text-muted-foreground">Ora</span>

        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => onAdjust(1, 0)} className={spinnerBtn}>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 select-none text-center font-mono text-sm font-semibold tabular-nums">
            {String(hours).padStart(2, '0')}
          </span>
          <button type="button" onClick={() => onAdjust(-1, 0)} className={spinnerBtn}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="pb-0.5 text-base font-bold text-muted-foreground">:</span>

        <div className="flex flex-col items-center gap-0.5">
          <button type="button" onClick={() => onAdjust(0, 5)} className={spinnerBtn}>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 select-none text-center font-mono text-sm font-semibold tabular-nums">
            {String(minutes).padStart(2, '0')}
          </span>
          <button type="button" onClick={() => onAdjust(0, -5)} className={spinnerBtn}>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DateTimePickerProps {
  /** YYYY-MM-DDTHH:mm (datetime) or YYYY-MM-DD (dateOnly) */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Date-only mode: mask __/__/____, no time spinner */
  dateOnly?: boolean
  /** Show "Set to now" clock button */
  showNow?: boolean
  /** IANA timezone for "now". Defaults to browser local. */
  nowTimezone?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  dateOnly = false,
  showNow = false,
  nowTimezone,
}: DateTimePickerProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Tracks the last value we emitted so we can distinguish external vs internal changes
  const lastEmitted = React.useRef(value)
  // Cursor position to apply after next render
  const pendingCursor = React.useRef<number | null>(null)
  const [open, setOpen] = React.useState(false)
  const [nowFlashed, setNowFlashed] = React.useState(false)

  const { slots, numSlots } = cfg(dateOnly)

  // ── Local digit state ─────────────────────────────────────────────────────

  const [digits, setDigits] = React.useState<string[]>(() => valueToDigits(value, dateOnly))
  const [activeSlot, setActiveSlot] = React.useState(0)

  // Sync from external value changes only (not from changes we emitted ourselves)
  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      setDigits(valueToDigits(value, dateOnly))
      lastEmitted.current = value
    }
  }, [value, dateOnly])

  // Apply pending cursor position after renders caused by digit/slot changes
  React.useLayoutEffect(() => {
    if (pendingCursor.current !== null && inputRef.current) {
      const pos = pendingCursor.current
      inputRef.current.setSelectionRange(pos, pos + 1)
      pendingCursor.current = null
    }
  }, [digits, activeSlot])

  // ── Emit helpers ──────────────────────────────────────────────────────────

  const emitDigits = React.useCallback((newDigits: string[]) => {
    setDigits(newDigits)
    const newValue = digitsToValue(newDigits, dateOnly)
    lastEmitted.current = newValue
    onChange(newValue)
  }, [dateOnly, onChange])

  const schedCursor = React.useCallback((slotIdx: number) => {
    const clamped = Math.max(0, Math.min(slotIdx, slots.length - 1))
    pendingCursor.current = slots[clamped]
    setActiveSlot(clamped)
  }, [slots])

  // ── Input handlers ────────────────────────────────────────────────────────

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    if (disabled) return
    const clickPos = e.currentTarget.selectionStart ?? 0
    let nearest = 0
    let minDist = Infinity
    slots.forEach((pos, i) => {
      const dist = Math.abs(clickPos - pos)
      if (dist < minDist) { minDist = dist; nearest = i }
    })
    schedCursor(nearest)
  }

  const handleFocus = () => {
    if (disabled) return
    const firstEmpty = digits.findIndex((d) => !d)
    schedCursor(firstEmpty >= 0 ? firstEmpty : 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      const newDigits = [...digits]
      newDigits[activeSlot] = e.key
      emitDigits(newDigits)
      schedCursor(activeSlot < numSlots - 1 ? activeSlot + 1 : activeSlot)
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      const newDigits = [...digits]
      if (digits[activeSlot]) {
        newDigits[activeSlot] = ''
        emitDigits(newDigits)
        schedCursor(activeSlot)
      } else if (activeSlot > 0) {
        newDigits[activeSlot - 1] = ''
        emitDigits(newDigits)
        schedCursor(activeSlot - 1)
      }
    } else if (e.key === 'Delete') {
      e.preventDefault()
      const newDigits = [...digits]
      newDigits[activeSlot] = ''
      emitDigits(newDigits)
      schedCursor(activeSlot)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (activeSlot > 0) schedCursor(activeSlot - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (activeSlot < numSlots - 1) schedCursor(activeSlot + 1)
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      // let bubble
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      // let Ctrl+V / Cmd+V bubble so the native paste event fires
    } else {
      e.preventDefault()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').trim()
    const parsed = tryParseDate(text)
    if (parsed && !isNaN(parsed.getTime())) {
      const storeFormat = dateOnly ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm"
      const newValue = format(parsed, storeFormat)
      lastEmitted.current = newValue
      setDigits(valueToDigits(newValue, dateOnly))
      onChange(newValue)
      setOpen(false)
    }
  }

  // ── Calendar handlers ─────────────────────────────────────────────────────

  const dateObj = React.useMemo(() => {
    if (!value) return undefined
    const storeFormat = dateOnly ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm"
    const d = parse(value, storeFormat, new Date())
    return isNaN(d.getTime()) ? undefined : d
  }, [value, dateOnly])

  const hours = dateObj ? dateObj.getHours() : 0
  const minutes = dateObj ? dateObj.getMinutes() : 0

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return
    const storeFormat = dateOnly ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm"
    if (!dateOnly) day.setHours(hours, minutes, 0, 0)
    const newValue = format(day, storeFormat)
    lastEmitted.current = newValue
    setDigits(valueToDigits(newValue, dateOnly))
    onChange(newValue)
    if (dateOnly) setOpen(false)
  }

  const adjustTime = (hDelta: number, mDelta: number) => {
    const base = dateObj ? new Date(dateObj) : new Date()
    if (!dateObj) base.setHours(0, 0, 0, 0)
    base.setHours((base.getHours() + hDelta + 24) % 24, (base.getMinutes() + mDelta + 60) % 60, 0, 0)
    const newValue = format(base, "yyyy-MM-dd'T'HH:mm")
    lastEmitted.current = newValue
    setDigits(valueToDigits(newValue, dateOnly))
    onChange(newValue)
  }

  // ── Clear button ──────────────────────────────────────────────────────────

  const handleClear = () => {
    const empty = Array<string>(numSlots).fill('')
    lastEmitted.current = ''
    setDigits(empty)
    setActiveSlot(0)
    onChange('')
  }

  // ── Now button ────────────────────────────────────────────────────────────

  const handleNow = () => {
    const storeFormat = dateOnly ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm"
    const newValue = nowTimezone
      ? formatInTimeZone(new Date(), nowTimezone, storeFormat)
      : format(new Date(), storeFormat)
    lastEmitted.current = newValue
    setDigits(valueToDigits(newValue, dateOnly))
    onChange(newValue)
    setNowFlashed(true)
    setTimeout(() => setNowFlashed(false), 500)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const actionBtn = cn(
    'flex h-10 w-9 shrink-0 items-center justify-center',
    'border-l border-input bg-background',
    'text-muted-foreground/55 transition-all duration-150',
    'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        {/*
         * The outer div owns the border, rounded corners, and the focus ring.
         * focus-within ensures the ring wraps all children as a single unit.
         */}
        <div
          className={cn(
            'flex items-stretch overflow-hidden rounded-md border border-input bg-background',
            'ring-offset-background',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {/* Masked text input — user types digits directly */}
          <input
            ref={inputRef}
            type="text"
            value={buildDisplay(digits, dateOnly)}
            onChange={() => {}} // fully controlled via onKeyDown
            onKeyDown={handleKeyDown}
            onClick={handleClick}
            onFocus={handleFocus}
            onPaste={handlePaste}
            disabled={disabled}
            className={cn(
              'h-10 min-w-0 flex-1 cursor-text border-0 bg-transparent pl-3 py-2 pr-1 font-mono text-sm tracking-wider',
              'focus:outline-none',
              disabled && 'cursor-not-allowed',
            )}
          />

          {/* Calendar button — opens/closes popover */}
          <button
            type="button"
            onClick={() => !disabled && setOpen((v) => !v)}
            disabled={disabled}
            title="Apri calendario"
            className={cn(actionBtn, 'hover:bg-accent hover:text-foreground')}
          >
            <CalendarIcon className="h-4 w-4" />
          </button>

          {/* "Set to now" button */}
          {showNow && (
            <button
              type="button"
              onClick={handleNow}
              disabled={disabled}
              title="Imposta data e ora corrente"
              className={cn(
                actionBtn,
                'hover:bg-primary/8 hover:text-primary',
                nowFlashed && 'bg-primary/12 text-primary',
              )}
            >
              <Clock
                className={cn(
                  'h-4 w-4 transition-all duration-300',
                  nowFlashed && 'rotate-[30deg] scale-90',
                )}
              />
            </button>
          )}

          {/* Clear button — visible only when a value (or partial digits) exist */}
          {digits.some((d) => d) && (
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              title="Cancella data"
              className={cn(actionBtn, 'hover:bg-destructive/10 hover:text-destructive')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent className="!w-[360px] p-0" align="start">
        <Calendar
          mode="single"
          selected={dateObj}
          onSelect={handleDaySelect}
          startMonth={new Date(2020, 0)}
          endMonth={new Date(new Date().getFullYear() + 2, 11)}
          initialFocus
          className="w-full"
        />

        {/* Time spinner — only in full datetime mode */}
        {!dateOnly && (
          <TimeSpinner hours={hours} minutes={minutes} onAdjust={adjustTime} />
        )}
      </PopoverContent>
    </Popover>
  )
}

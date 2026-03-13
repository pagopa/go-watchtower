'use client'

import { useCallback, useEffect, useRef } from 'react'
import { formatJsDate, isSameDay } from '@go-watchtower/shared'
import { CalendarIcon, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface DateRangePreset {
  label: string
  range: () => DateRange
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  className?: string
  /** Optional preset shortcuts shown in a sidebar inside the popover. */
  presets?: DateRangePreset[]
  placeholder?: string
}

export function DateRangePicker({
  value,
  onChange,
  className,
  presets,
  placeholder = 'Seleziona periodo',
}: DateRangePickerProps) {
  const activePresetIndex = presets?.findIndex((p) => {
    const r = p.range()
    return (
      value?.from && value?.to && r.from && r.to &&
      isSameDay(value.from, r.from) && isSameDay(value.to, r.to)
    )
  }) ?? -1

  const formatTrigger = () => {
    if (!value?.from) return placeholder
    if (!value.to) return formatJsDate(value.from, 'dd MMM yyyy')
    if (isSameDay(value.from, value.to)) return formatJsDate(value.from, 'dd MMM yyyy')
    return `${formatJsDate(value.from, 'dd MMM yyyy')} – ${formatJsDate(value.to, 'dd MMM yyyy')}`
  }

  const hasPresets = presets && presets.length > 0

  // Track whether range is complete to reset on next click
  const rangeCompleteRef = useRef(false)
  useEffect(() => {
    rangeCompleteRef.current = !!(value?.from && value?.to)
  }, [value?.from, value?.to])

  const handleCalendarSelect = useCallback(
    (_range: DateRange | undefined, triggerDate: Date) => {
      if (rangeCompleteRef.current) {
        // Range was complete — restart from the clicked day
        onChange({ from: triggerDate, to: undefined })
      } else {
        onChange(_range)
      }
    },
    [onChange],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-normal',
            !value?.from && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{formatTrigger()}</span>
          {value?.from && (
            <X
              className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onChange(undefined)
              }}
            />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {hasPresets && (
            <div className="flex flex-col gap-0.5 border-r p-2">
              {presets.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChange(preset.range())}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-left text-sm transition-colors whitespace-nowrap',
                    activePresetIndex === i
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              ))}
              {value?.from && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    onClick={() => onChange(undefined)}
                    className="rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    Pulisci
                  </button>
                </>
              )}
            </div>
          )}
          <Calendar
            mode="range"
            selected={value}
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

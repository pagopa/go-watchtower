'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { it } from 'react-day-picker/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTH_NAMES, MONTH_SHORT_NAMES } from '@go-watchtower/shared'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  startMonth,
  endMonth,
  numberOfMonths = 1,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- extracted to keep out of ...props
  month: _externalMonth,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- extracted to keep out of ...props
  onMonthChange: _externalOnMonthChange,
  ...props
}: CalendarProps) {
  const startYear = startMonth?.getFullYear() ?? 2020
  const endYear = endMonth?.getFullYear() ?? (new Date().getFullYear() + 2)
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)

  // Initialise the displayed month from the selected date (if any), else today
  const getInitialMonth = (): Date => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sel = (props as any).selected
    if (sel instanceof Date && !isNaN(sel.getTime()))
      return new Date(sel.getFullYear(), sel.getMonth(), 1)
    if (sel && typeof sel === 'object' && 'from' in sel && sel.from instanceof Date)
      return new Date(sel.from.getFullYear(), sel.from.getMonth(), 1)
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  }

  const [month, setMonth] = React.useState<Date>(getInitialMonth)

  // For numberOfMonths > 1, compute the last visible month for the header label
  const lastVisibleMonth = React.useMemo(() => {
    const d = new Date(month)
    d.setMonth(d.getMonth() + numberOfMonths - 1)
    return d
  }, [month, numberOfMonths])

  const prevMonth = () =>
    setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))

  const nextMonth = () =>
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))

  return (
    <div className={cn('p-3', className)}>

      {/* ── Custom header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">

        {/* Prev button */}
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Mese precedente"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {numberOfMonths > 1 ? (
          /* Range picker: plain text "Gen 2026 – Feb 2026" */
          <span className="text-sm font-medium select-none">
            {MONTH_SHORT_NAMES[month.getMonth()]} {month.getFullYear()}
            {' – '}
            {MONTH_SHORT_NAMES[lastVisibleMonth.getMonth()]} {lastVisibleMonth.getFullYear()}
          </span>
        ) : (
          /* Single picker: interactive Radix selects — never truncate */
          <div className="flex items-center gap-1.5">
            <Select
              value={String(month.getMonth())}
              onValueChange={(v) =>
                setMonth(m => new Date(m.getFullYear(), Number(v), 1))
              }
            >
              <SelectTrigger className="h-7 w-[140px] text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={String(month.getFullYear())}
              onValueChange={(v) =>
                setMonth(m => new Date(Number(v), m.getMonth(), 1))
              }
            >
              <SelectTrigger className="h-7 w-[80px] text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Next button */}
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Mese successivo"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── DayPicker — grid only, built-in caption & nav hidden ───────── */}
      <DayPicker
        locale={it}
        showOutsideDays={showOutsideDays}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={numberOfMonths}
        captionLayout="label"
        hideNavigation
        classNames={{
          months: 'flex flex-col sm:flex-row gap-6',
          month: 'w-full',
          month_caption: 'hidden',
          nav: 'hidden',
          month_grid: 'w-full border-collapse space-y-1',
          weekdays: 'flex',
          weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
          week: 'flex w-full mt-2',
          day: cn(
            'h-9 w-9 text-center text-sm p-0 relative',
            '[&:has([aria-selected].day-range-end)]:rounded-r-md',
            '[&:has([aria-selected].day-outside)]:bg-accent/50',
            '[&:has([aria-selected])]:bg-accent',
            'first:[&:has([aria-selected])]:rounded-l-md',
            'last:[&:has([aria-selected])]:rounded-r-md',
            'focus-within:relative focus-within:z-20',
            // Override ghost button hover on selected days — let td bg show through
            '[&[aria-selected=true]>button:hover]:bg-transparent [&[aria-selected=true]>button:hover]:text-[inherit]',
          ),
          day_button: cn(
            buttonVariants({ variant: 'ghost' }),
            'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
          ),
          range_end: 'day-range-end',
          selected:
            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md',
          today: 'bg-accent text-accent-foreground rounded-md',
          outside:
            'day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
          disabled: 'text-muted-foreground opacity-50',
          range_middle:
            'aria-selected:bg-accent aria-selected:text-accent-foreground',
          hidden: 'invisible',
          ...classNames,
        }}
        {...props}
      />
    </div>
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }

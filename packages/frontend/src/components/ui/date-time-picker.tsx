'use client'

import * as React from 'react'
import { CalendarIcon } from 'lucide-react'
import { format, parse } from 'date-fns'
import { it } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'

interface DateTimePickerProps {
  value: string // YYYY-MM-DDTHH:mm
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Seleziona data e ora',
  disabled = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)

  const dateObj = value ? parse(value, "yyyy-MM-dd'T'HH:mm", new Date()) : undefined
  const isValidDate = dateObj && !isNaN(dateObj.getTime())

  const displayValue = isValidDate
    ? format(dateObj, 'dd/MM/yyyy HH:mm', { locale: it })
    : ''

  const timeValue = isValidDate ? format(dateObj, 'HH:mm') : '00:00'

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return
    const hours = isValidDate ? dateObj.getHours() : 0
    const minutes = isValidDate ? dateObj.getMinutes() : 0
    day.setHours(hours, minutes, 0, 0)
    onChange(format(day, "yyyy-MM-dd'T'HH:mm"))
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(':').map(Number)
    if (isNaN(hours) || isNaN(minutes)) return

    const base = isValidDate ? new Date(dateObj) : new Date()
    base.setHours(hours, minutes, 0, 0)

    if (!isValidDate) {
      // If no date selected yet, use today
      onChange(format(base, "yyyy-MM-dd'T'HH:mm"))
    } else {
      onChange(format(base, "yyyy-MM-dd'T'HH:mm"))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{displayValue || placeholder}</span>
          <CalendarIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValidDate ? dateObj : undefined}
          onSelect={handleDaySelect}
          initialFocus
        />
        <div className="border-t p-3">
          <Input
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            className="w-full"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

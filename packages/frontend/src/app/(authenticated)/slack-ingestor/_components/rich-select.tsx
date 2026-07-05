'use client'

import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface RichSelectOption<T extends string> {
  value: T
  label: string
  description?: string
}

interface RichSelectProps<T extends string> {
  value: T
  options: ReadonlyArray<RichSelectOption<T>>
  onValueChange: (value: T) => void
  disabled?: boolean
  className?: string
  /** Testo mostrato nel trigger quando il valore non corrisponde ad alcuna opzione. */
  placeholder?: string
  /** Contenuto extra reso accanto alla label nel trigger (es. un pallino colorato). */
  renderValuePrefix?: (value: T) => React.ReactNode
}

/**
 * Select con descrizione per ogni opzione: nel menu ogni voce mostra label e
 * spiegazione, nel trigger resta solo la label della voce selezionata.
 */
export function RichSelect<T extends string>({
  value,
  options,
  onValueChange,
  disabled = false,
  className,
  placeholder,
  renderValuePrefix,
}: RichSelectProps<T>) {
  const selected = options.find((option) => option.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && renderValuePrefix?.(value)}
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected?.label ?? placeholder ?? value}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[280px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="items-start gap-2 py-2"
            onSelect={() => onValueChange(option.value)}
          >
            <Check className={cn('mt-0.5 h-4 w-4 shrink-0', option.value === value ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0">
              <span className="block font-medium">{option.label}</span>
              {option.description && (
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.description}</span>
              )}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

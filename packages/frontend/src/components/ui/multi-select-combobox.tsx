'use client'

import * as React from 'react'
import { X, Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'

interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
}

export function MultiSelectCombobox({
  options,
  value,
  onValueChange,
  placeholder = 'Seleziona...',
  searchPlaceholder = 'Cerca...',
  emptyMessage = 'Nessun risultato.',
  disabled = false,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()

  const selectedOptions = options.filter((o) => value.includes(o.value))

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onValueChange(value.filter((v) => v !== optionValue))
    } else {
      onValueChange([...value, optionValue])
    }
  }

  const handleRemove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!disabled) {
      onValueChange(value.filter((v) => v !== optionValue))
    }
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            disabled={disabled}
            className={cn(
              'flex min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              !value.length && 'text-muted-foreground'
            )}
          >
            <span className="truncate">
              {value.length > 0
                ? `${value.length} selezionat${value.length === 1 ? 'o' : 'i'}`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0" align="start">
          <Command
            filter={(val, search) => {
              const label = options.find((o) => o.value === val)?.label ?? ''
              return label.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList id={listId}>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleToggle(option.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.includes(option.value) ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected tags */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <Badge key={option.value} variant="secondary" className="gap-1 pr-1">
              {option.label}
              <button
                type="button"
                onClick={(e) => handleRemove(option.value, e)}
                disabled={disabled}
                className="ml-0.5 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

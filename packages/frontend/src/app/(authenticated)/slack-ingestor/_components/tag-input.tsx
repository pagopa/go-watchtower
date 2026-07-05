'use client'

import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface TagInputProps {
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  /** Valori proposti mentre si digita (opzionali, l'input resta libero). */
  suggestions?: string[]
  disabled?: boolean
}

/**
 * Input a tag per dimensioni a valore libero: Invio (o virgola) aggiunge il
 * valore digitato, i suggerimenti filtrati si aggiungono con un click.
 */
export function TagInput({ value, onValueChange, placeholder, suggestions = [], disabled = false }: TagInputProps) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const matching = useMemo(() => {
    const needle = text.trim().toLowerCase()
    if (!needle) return []
    return suggestions
      .filter((candidate) => !value.includes(candidate) && candidate.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [text, suggestions, value])

  const add = (raw: string) => {
    const entry = raw.trim()
    if (!entry) return
    if (!value.includes(entry)) onValueChange([...value, entry])
    setText('')
    inputRef.current?.focus()
  }

  const remove = (entry: string) => {
    if (!disabled) onValueChange(value.filter((item) => item !== entry))
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background',
          focused && 'ring-2 ring-ring ring-offset-2',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((entry) => (
          <Badge key={entry} variant="secondary" className="gap-1 pr-1 font-mono text-[11px] font-normal">
            {entry}
            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                remove(entry)
              }}
              className="ml-0.5 rounded-full outline-none hover:bg-muted-foreground/20 focus:ring-2 focus:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            add(text)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              add(text)
            } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
              remove(value[value.length - 1])
            }
          }}
        />
      </div>
      {focused && matching.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {matching.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-accent hover:text-accent-foreground"
              // mousedown per anticipare il blur dell'input, che aggiungerebbe il testo parziale
              onMouseDown={(event) => {
                event.preventDefault()
                add(candidate)
              }}
            >
              {candidate}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

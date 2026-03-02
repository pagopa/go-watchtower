'use client'

import { ChevronDown, Play, EyeOff, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ShortcutType = 'in-corso' | 'ignorable' | 'full'

interface CreateAnalysisDropdownProps {
  onSelect: (type: ShortcutType) => void
}

export function CreateAnalysisDropdown({ onSelect }: CreateAnalysisDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          Nuova Analisi
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onSelect('in-corso')}>
          <Play className="mr-2 h-4 w-4" />
          In corso
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect('ignorable')}>
          <EyeOff className="mr-2 h-4 w-4" />
          Da ignorare
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSelect('full')}>
          <FileText className="mr-2 h-4 w-4" />
          Analisi completa…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

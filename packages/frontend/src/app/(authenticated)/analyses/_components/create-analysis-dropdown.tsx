'use client'

import { ChevronDown, Play, Ban, ListX, UserX, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ShortcutType = 'in-corso' | 'disservizio' | 'ignore-list' | 'non-gestito' | 'full'

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
        <DropdownMenuItem onClick={() => onSelect('disservizio')}>
          <Ban className="mr-2 h-4 w-4" />
          Disservizio
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect('ignore-list')}>
          <ListX className="mr-2 h-4 w-4" />
          Ignore list
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect('non-gestito')}>
          <UserX className="mr-2 h-4 w-4" />
          Non gestito
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSelect('full')}>
          <FileText className="mr-2 h-4 w-4" />
          Analisi completa...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

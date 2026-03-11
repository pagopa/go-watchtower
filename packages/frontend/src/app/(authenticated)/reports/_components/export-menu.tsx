'use client'

import { Download, FileSpreadsheet, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ExportMenuProps {
  onExportCsv: () => void
  onExportJson: () => void
  disabled?: boolean
}

export function ExportMenu({ onExportCsv, onExportJson, disabled }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="mr-2 h-4 w-4" />
          Esporta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onExportCsv}>
          <FileSpreadsheet className="h-4 w-4" />
          Esporta CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportJson}>
          <FileJson className="h-4 w-4" />
          Esporta JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

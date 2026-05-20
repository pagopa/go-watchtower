'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileJson, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, ApiClientError, type ExportAnalysesRequest } from '@/lib/api-client'

interface ExportAnalysesMenuProps {
  selectedIds: string[]
  filteredCount: number
  filters: ExportAnalysesRequest['filters']
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function timestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

export function ExportAnalysesMenu({
  selectedIds,
  filteredCount,
  filters,
}: ExportAnalysesMenuProps) {
  const [loading, setLoading] = useState(false)

  const runExport = async (
    format: 'csv' | 'json',
    mode: 'selected' | 'filtered',
  ) => {
    if (loading) return
    setLoading(true)
    const toastId = toast.loading(
      mode === 'selected'
        ? `Esporto ${selectedIds.length} analisi selezionate...`
        : `Esporto ${filteredCount} analisi filtrate...`,
    )
    try {
      const body: ExportAnalysesRequest =
        mode === 'selected'
          ? { format, ids: selectedIds }
          : { format, filters }
      const blob = await api.exportAnalyses(body)
      triggerDownload(blob, `analyses-export-${timestamp()}.${format}`)
      toast.success('Esportazione completata', { id: toastId })
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : 'Errore durante l\'esportazione'
      toast.error(message, { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  const hasSelection = selectedIds.length > 0
  const hasFiltered = filteredCount > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading || (!hasSelection && !hasFiltered)}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Esporta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {hasSelection && (
          <>
            <DropdownMenuLabel>
              Selezionati ({selectedIds.length})
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => runExport('csv', 'selected')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Esporta CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => runExport('json', 'selected')}>
              <FileJson className="mr-2 h-4 w-4" />
              Esporta JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>
          Risultati filtrati ({filteredCount})
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => runExport('csv', 'filtered')}
          disabled={!hasFiltered}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Esporta CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => runExport('json', 'filtered')}
          disabled={!hasFiltered}
        >
          <FileJson className="mr-2 h-4 w-4" />
          Esporta JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

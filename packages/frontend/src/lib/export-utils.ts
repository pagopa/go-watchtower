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

export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}

function escapeCsvValue(value: unknown): string {
  const str = value == null ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function downloadCsv<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  filename: string
): void {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',')
  const rows = data.map((row) =>
    columns.map((c) => escapeCsvValue(row[c.key])).join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

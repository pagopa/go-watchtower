export function formatDuration(ms: number | null): string {
  if (ms == null) return '-'

  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 0) return '-'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

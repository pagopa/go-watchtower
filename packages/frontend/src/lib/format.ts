/**
 * Shared formatting utilities — re-exported from @go-watchtower/shared.
 */
export { formatDateTime, formatDateLong, formatDateShort } from '@go-watchtower/shared'

/** Extract up to 2 initials from a name string. */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

/**
 * Shared formatting utilities.
 */

/** Format ISO date as "dd/MM/yyyy, HH:mm" in Italian locale. */
export function formatDateTime(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format ISO date as "dd MMMM yyyy" in Italian locale (no time). */
export function formatDateLong(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

/** Format ISO date as "dd/MM/yyyy" in Italian locale (no time). */
export function formatDateShort(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Extract up to 2 initials from a name string. */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

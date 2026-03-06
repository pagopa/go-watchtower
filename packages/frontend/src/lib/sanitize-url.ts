/**
 * Sanitizes a URL to prevent javascript: and data: scheme injection.
 * Returns the URL unchanged if it uses http/https, or '#' otherwise.
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '#'
  const trimmed = url.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  if (trimmed.startsWith('/')) return trimmed
  return '#'
}

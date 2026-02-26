import type { ValidationRule } from '@/lib/analysis-validation/types'

export const linksRules: ValidationRule[] = [
  {
    id: 'LINK_URL_FORMAT',
    severity: 'warning',
    weight: 1,
    message: (a) => {
      const invalid = a.links.filter(
        (l) => !l.url.startsWith('http://') && !l.url.startsWith('https://')
      ).length
      return invalid === 1
        ? 'Un link ha un formato URL non valido'
        : `${invalid} link hanno un formato URL non valido`
    },
    appliesTo: (a) => a.links.length > 0,
    validate: (a) =>
      a.links.every(
        (l) => l.url.startsWith('http://') || l.url.startsWith('https://')
      ),
  },
]

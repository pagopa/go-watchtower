import { z } from 'zod'
import type { IgnoreReasonDetailsSchema } from '@/lib/api-client'

/**
 * Builds a Zod schema for `ignoreDetails` from an IgnoreReasonDetailsSchema.
 * Required fields get `.min(1)` validation; optional fields are `.optional()`.
 * Returns `z.object({}).optional()` if the schema has no properties.
 */
export function buildIgnoreDetailsZodSchema(
  schema: IgnoreReasonDetailsSchema | null | undefined,
): z.ZodTypeAny {
  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return z.record(z.string(), z.unknown()).optional()
  }

  const required = new Set(schema.required ?? [])
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, def] of Object.entries(schema.properties)) {
    if (def.type === 'number') {
      shape[key] = required.has(key)
        ? z.coerce.number({ message: `${def.title} è obbligatorio` })
        : z.coerce.number().optional()
    } else {
      // string (including enum, textarea) — default('') coerces undefined to '' so min(1) shows the right message
      shape[key] = required.has(key)
        ? z.string({ message: `${def.title} è obbligatorio` }).default('').pipe(z.string().min(1, `${def.title} è obbligatorio`))
        : z.string().optional()
    }
  }

  return z.object(shape)
}

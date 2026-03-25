'use client'

/**
 * DynamicIgnoreDetailsForm
 *
 * Renders form fields dynamically from an IgnoreReasonDetailsSchema.
 * Supports: string (input), string+x-ui:textarea (textarea), number (input).
 * Required fields are validated by the parent Zod schema via ignoreDetails.
 */

import { z } from 'zod'
import { Controller, type Control, type FieldValues } from 'react-hook-form'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { IgnoreReasonDetailsSchema, IgnoreReasonFieldDef } from '@/lib/api-client'

interface DynamicIgnoreDetailsFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<FieldValues>
  schema: IgnoreReasonDetailsSchema
  disabled?: boolean
  preview?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors?: Record<string, any>
}

function FieldDescription({ text }: { text?: string }) {
  if (!text) return null
  return <p className="text-xs text-muted-foreground">{text}</p>
}

function PreviewField({ name, def, required }: { name: string; def: IgnoreReasonFieldDef; required: boolean }) {
  const fieldPath = `ignoreDetails.${name}`
  const isEnum = def.enum && def.enum.length > 0
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldPath}>
        {def.title}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {isEnum && <FieldDescription text={def.description} />}
      {def['x-ui'] === 'textarea' ? (
        <Textarea id={fieldPath} placeholder={def.description} rows={3} disabled />
      ) : isEnum ? (
        <Select disabled>
          <SelectTrigger id={fieldPath}>
            <SelectValue placeholder="Seleziona..." />
          </SelectTrigger>
        </Select>
      ) : (
        <Input id={fieldPath} type={def.type === 'number' ? 'number' : 'text'} placeholder={def.description} disabled />
      )}
    </div>
  )
}

function DynamicField({
  name,
  def,
  required,
  control,
  disabled,
  errors,
}: {
  name: string
  def: IgnoreReasonFieldDef
  required: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<FieldValues>
  disabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors?: Record<string, any>
}) {
  const fieldPath = `ignoreDetails.${name}`
  const fieldError = errors?.[name]

  const isEnum = def.enum && def.enum.length > 0

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldPath}>
        {def.title}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {isEnum && <FieldDescription text={def.description} />}
      <Controller
        name={fieldPath}
        control={control}
        render={({ field }) => {
          if (def['x-ui'] === 'textarea') {
            return (
              <Textarea
                id={fieldPath}
                placeholder={def.description}
                rows={3}
                value={field.value ?? ''}
                onChange={field.onChange}
                disabled={disabled}
              />
            )
          }
          if (def.type === 'number') {
            return (
              <Input
                id={fieldPath}
                type="number"
                placeholder={def.description}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                disabled={disabled}
              />
            )
          }
          if (isEnum) {
            const labels = def['x-enumLabels'] ?? def.enum!
            return (
              <Select
                value={field.value ?? ''}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id={fieldPath}>
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {def.enum!.map((val, i) => (
                    <SelectItem key={val} value={val}>
                      {labels[i] ?? val}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
          // default: string input
          return (
            <Input
              id={fieldPath}
              type="text"
              placeholder={def.description}
              value={field.value ?? ''}
              onChange={field.onChange}
              disabled={disabled}
            />
          )
        }}
      />
      {fieldError && (
        <p className="text-sm text-destructive">{fieldError.message as string}</p>
      )}
    </div>
  )
}

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

export function DynamicIgnoreDetailsForm({
  control,
  schema,
  disabled,
  preview,
  errors,
}: DynamicIgnoreDetailsFormProps) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) return null

  const required = schema.required ?? []
  const detailsErrors = errors?.ignoreDetails
  const orderedKeys = (schema as Record<string, unknown>)['x-order'] as string[] | undefined
  const keys = orderedKeys
    ? orderedKeys.filter((k) => k in schema.properties!)
    : Object.keys(schema.properties)

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
      {keys.map((key) => {
        const def = schema.properties![key]!
        return preview ? (
          <PreviewField key={key} name={key} def={def} required={required.includes(key)} />
        ) : (
          <DynamicField
            key={key}
            name={key}
            def={def}
            required={required.includes(key)}
            control={control}
            disabled={disabled}
            errors={detailsErrors}
          />
        )
      })}
    </div>
  )
}

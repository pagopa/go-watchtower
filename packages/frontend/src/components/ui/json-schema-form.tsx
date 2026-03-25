'use client'

/**
 * DynamicIgnoreDetailsForm
 *
 * Renders form fields dynamically from an IgnoreReasonDetailsSchema.
 * Supports: string (input), string+x-ui:textarea (textarea), number (input).
 * Required fields are validated by the parent Zod schema via ignoreDetails.
 */

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

function PreviewField({ name, def, required }: { name: string; def: IgnoreReasonFieldDef; required: boolean }) {
  const fieldPath = `ignoreDetails.${name}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldPath}>
        {def.title}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {def['x-ui'] === 'textarea' ? (
        <Textarea id={fieldPath} placeholder={def.description} rows={3} disabled />
      ) : def.enum && def.enum.length > 0 ? (
        <Select disabled>
          <SelectTrigger id={fieldPath}>
            <SelectValue placeholder={def.description ?? 'Seleziona...'} />
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

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldPath}>
        {def.title}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
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
          if (def.enum && def.enum.length > 0) {
            const labels = def['x-enumLabels'] ?? def.enum
            return (
              <Select
                value={field.value ?? ''}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <SelectTrigger id={fieldPath}>
                  <SelectValue placeholder={def.description ?? 'Seleziona...'} />
                </SelectTrigger>
                <SelectContent>
                  {def.enum.map((val, i) => (
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

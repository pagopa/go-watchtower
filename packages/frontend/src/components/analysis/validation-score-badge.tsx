'use client'

import { cn } from '@/lib/utils'
import type { ValidationResult, QualityResult } from '@/lib/analysis-validation'
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'

interface ValidationScoreBadgeProps {
  validation: ValidationResult
  quality: QualityResult
  onClick?: () => void
  className?: string
}

function getValidityColor(score: number) {
  if (score >= 90) return { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' }
  if (score >= 60) return { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10' }
  return { dot: 'bg-red-500', text: 'text-red-700 dark:text-red-400', bg: 'bg-red-500/10' }
}

function getQualityColor(score: number) {
  if (score >= 7) return { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10' }
  if (score >= 6) return { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10' }
  return { text: 'text-red-700 dark:text-red-400', bg: 'bg-red-500/10' }
}

export function ValidationScoreBadge({
  validation,
  quality,
  onClick,
  className,
}: ValidationScoreBadgeProps) {
  const validity = getValidityColor(validation.score)
  const qual = getQualityColor(quality.score)

  const errorCount = validation.errors.length
  const warningCount = validation.warnings.length

  const validityTooltip = `${errorCount} ${errorCount === 1 ? 'errore' : 'errori'}, ${warningCount} warning`
  const qualityTooltip = `${quality.satisfiedCount}/${quality.totalApplicable} criteri soddisfatti`

  const isClickable = !!onClick

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn('inline-flex items-center gap-1.5', className)}
        onClick={isClickable ? (e) => { e.stopPropagation(); onClick() } : undefined}
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onClick() } } : undefined}
      >
        {/* Validity badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                validity.bg,
                validity.text,
                isClickable && 'cursor-pointer transition-opacity hover:opacity-80'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', validity.dot)} />
              {Math.round(validation.score)}%
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {validityTooltip}
          </TooltipContent>
        </Tooltip>

        {/* Quality badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                qual.bg,
                qual.text,
                isClickable && 'cursor-pointer transition-opacity hover:opacity-80'
              )}
            >
              {quality.score}/10
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {qualityTooltip}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

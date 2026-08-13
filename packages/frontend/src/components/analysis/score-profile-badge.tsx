'use client'

import { Bot } from 'lucide-react'
import { AUTOMATION_EXEMPT_RULE_IDS } from '@go-watchtower/shared'
import { cn } from '@/lib/utils'

interface ScoreProfileBadgeProps {
  readonly origin: 'MANUAL' | 'AUTOMATIC' | 'HYBRID' | undefined
  readonly className?: string
}

/**
 * Segnala che gli score sono stati calcolati con il profilo ridotto.
 *
 * Le analisi automatiche sono esentate dalle regole che presuppongono un
 * giudizio umano: senza questo badge un 100% automatico e un 100% manuale
 * sembrerebbero lo stesso risultato, mentre misurano insiemi di regole diversi.
 */
export function ScoreProfileBadge({ origin, className }: ScoreProfileBadgeProps) {
  if (origin !== 'AUTOMATIC') return null

  return (
    <span
      title={`Profilo automatico: ${AUTOMATION_EXEMPT_RULE_IDS.size} regole che richiedono giudizio umano non sono applicate. Non confrontabile con gli score delle analisi manuali.`}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300',
        className,
      )}
    >
      <Bot className="h-3 w-3" />
      regole ridotte — automatica
    </span>
  )
}

'use client'

import { cn } from '@/lib/utils'
import type { PanelResizeHandleProps } from '@/hooks/use-resizable-panel'

const GRIP_DOTS = ['a', 'b', 'c', 'd', 'e', 'f']

/**
 * Maniglia di ridimensionamento dei pannelli di dettaglio.
 *
 * Le props arrivano da `useResizablePanel`, che tiene la meccanica del
 * trascinamento e i limiti; qui resta solo l'aspetto: una linea che si ispessisce
 * al passaggio del mouse e i puntini di presa.
 */
export function PanelResizeHandle({ className, ...props }: PanelResizeHandleProps & { className?: string }) {
  return (
    <div
      {...props}
      className={cn(
        'group absolute left-0 top-0 z-10 flex h-full w-3 cursor-ew-resize items-center touch-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <div className="h-full w-px shrink-0 bg-border transition-[width,background-color] duration-150 group-hover:w-0.5 group-hover:bg-primary/60 group-active:bg-primary" />
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 flex -translate-y-1/2 flex-col items-center gap-[3px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {GRIP_DOTS.map((dot) => (
          <div key={dot} className="h-[3px] w-[3px] rounded-full bg-primary" />
        ))}
      </div>
    </div>
  )
}

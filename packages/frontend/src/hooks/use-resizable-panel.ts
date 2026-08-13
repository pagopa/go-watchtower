'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePreferences } from './use-preferences'
import { useViewportWidth } from './use-viewport-width'

/**
 * Larghezza corrente del pannello, come custom property CSS.
 *
 * Durante il trascinamento la larghezza viene scritta qui direttamente sul nodo
 * DOM, senza passare da React: il corpo dei pannelli è grande (centinaia di
 * righe di JSX) e un `setState` per ogni `pointermove` costerebbe la
 * ricostruzione dell'intero albero ad ogni frame. Lo stato React viene
 * aggiornato una sola volta, al rilascio.
 */
const WIDTH_VAR = '--panel-width'

/** Passo del ridimensionamento da tastiera; con Shift si usa quello lungo. */
const KEYBOARD_STEP = 24
const KEYBOARD_STEP_LARGE = 96

export interface ResizablePanelOptions {
  /** Chiave di persistenza in `UserPreferences.panelWidths`. */
  storageKey: string
  /** Larghezza minima in px. Viene ridotta se non ci sta nel viewport. */
  minWidth: number
  /** Larghezza massima in px, prima del limite legato al viewport. */
  maxWidth: number
  /** Larghezza usata quando non c'è preferenza salvata; anche il reset da doppio click. */
  defaultWidth: number
  /** Frazione massima della finestra occupabile dal pannello. */
  maxViewportRatio?: number
  /** Etichetta accessibile della maniglia. */
  label?: string
}

/** Props da spreddare su `<PanelResizeHandle />`. */
export interface PanelResizeHandleProps {
  ref: React.Ref<HTMLDivElement>
  role: 'separator'
  'aria-orientation': 'vertical'
  'aria-label': string
  'aria-valuenow': number
  'aria-valuemin': number
  'aria-valuemax': number
  tabIndex: 0
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  onLostPointerCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onDoubleClick: () => void
}

interface DragState {
  pointerId: number
  startX: number
  startWidth: number
  latestWidth: number
  frame: number | null
}

/**
 * Ridimensionamento orizzontale di un pannello ancorato a destra, con
 * larghezza persistita per singolo pannello.
 *
 * Il pannello cresce verso sinistra: trascinando la maniglia verso sinistra la
 * larghezza aumenta. I limiti tengono sempre conto della finestra, e sono gli
 * stessi usati sia per il clamp del trascinamento sia per il rendering — se
 * divergessero, la maniglia si staccherebbe dal puntatore appena il limite del
 * viewport diventa più stringente di quello in px.
 */
export function useResizablePanel({
  storageKey,
  minWidth,
  maxWidth,
  defaultWidth,
  maxViewportRatio = 0.9,
  label = 'Ridimensiona pannello',
}: ResizablePanelOptions) {
  const { preferences, updatePreferences } = usePreferences()
  const viewportWidth = useViewportWidth()

  const panelRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)

  // Limiti effettivi: prima dell'idratazione la finestra non è nota e valgono
  // quelli in px, che è anche ciò che ha reso il server.
  const effectiveMax = viewportWidth === null
    ? maxWidth
    : Math.min(maxWidth, Math.round(viewportWidth * maxViewportRatio))
  const effectiveMin = Math.min(minWidth, effectiveMax)

  const stored = preferences.panelWidths?.[storageKey] ?? preferences.detailPanelWidth ?? defaultWidth
  const [localWidth, setLocalWidth] = useState<number | null>(null)

  // `localWidth` prevale sulla preferenza: `updatePreferences` scrive la cache
  // in un microtask, quindi affidarsi solo ad essa farebbe tornare il pannello
  // alla larghezza precedente per un frame dopo ogni modifica.
  const width = Math.min(Math.max(localWidth ?? stored, effectiveMin), effectiveMax)

  // I gestori del puntatore sono stabili e leggono i limiti aggiornati da qui,
  // così non serve ricrearli ad ogni cambio di viewport.
  const limitsRef = useRef({ min: effectiveMin, max: effectiveMax })
  useEffect(() => {
    limitsRef.current = { min: effectiveMin, max: effectiveMax }
  }, [effectiveMin, effectiveMax])

  const widthRef = useRef(width)
  useEffect(() => {
    widthRef.current = width
  }, [width])

  const commit = useCallback((value: number) => {
    setLocalWidth(value)
    updatePreferences({ panelWidths: { ...preferences.panelWidths, [storageKey]: value } })
  }, [preferences.panelWidths, storageKey, updatePreferences])

  /** Scrive la larghezza sul DOM senza coinvolgere React. */
  const paint = useCallback((value: number) => {
    panelRef.current?.style.setProperty(WIDTH_VAR, `${value}px`)
    handleRef.current?.setAttribute('aria-valuenow', String(value))
  }, [])

  const stopDrag = useCallback((drag: DragState) => {
    if (drag.frame !== null) cancelAnimationFrame(drag.frame)
    dragRef.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
      latestWidth: widthRef.current,
      frame: null,
    }
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const { min, max } = limitsRef.current
    drag.latestWidth = Math.min(Math.max(drag.startWidth - (event.clientX - drag.startX), min), max)
    // Un solo aggiornamento per frame: da trackpad arrivano più eventi per
    // frame e ridipingere ad ognuno sarebbe lavoro buttato.
    if (drag.frame !== null) return
    drag.frame = requestAnimationFrame(() => {
      drag.frame = null
      paint(drag.latestWidth)
    })
  }, [paint])

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    stopDrag(drag)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    paint(drag.latestWidth)
    if (drag.latestWidth !== drag.startWidth) commit(drag.latestWidth)
  }, [commit, paint, stopDrag])

  // Il puntatore può perdere la cattura senza `pointerup`: dito sollevato fuori
  // dallo schermo, gesto annullato dal browser, tasto rilasciato fuori finestra.
  const onLostPointerCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    stopDrag(drag)
    paint(drag.latestWidth)
    if (drag.latestWidth !== drag.startWidth) commit(drag.latestWidth)
  }, [commit, paint, stopDrag])

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const { min, max } = limitsRef.current
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP
    let next: number | null = null
    // Il pannello è ancorato a destra: verso sinistra si allarga.
    if (event.key === 'ArrowLeft') next = widthRef.current + step
    else if (event.key === 'ArrowRight') next = widthRef.current - step
    else if (event.key === 'Home') next = min
    else if (event.key === 'End') next = max
    if (next === null) return
    event.preventDefault()
    commit(Math.min(Math.max(next, min), max))
  }, [commit])

  const onDoubleClick = useCallback(() => {
    const { min, max } = limitsRef.current
    commit(Math.min(Math.max(defaultWidth, min), max))
  }, [commit, defaultWidth])

  const handleProps: PanelResizeHandleProps = {
    ref: handleRef,
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-label': label,
    'aria-valuenow': width,
    'aria-valuemin': effectiveMin,
    'aria-valuemax': effectiveMax,
    tabIndex: 0,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onLostPointerCapture,
    onKeyDown,
    onDoubleClick,
  }

  return {
    /** Da applicare al contenitore del pannello, insieme a `panelStyle`. */
    panelRef,
    /** Definisce e consuma la custom property, così il primo paint è già corretto. */
    panelStyle: { [WIDTH_VAR]: `${width}px`, width: `var(${WIDTH_VAR})` } as React.CSSProperties,
    /** Larghezza committata, utile per etichette o test. */
    width,
    handleProps,
  }
}

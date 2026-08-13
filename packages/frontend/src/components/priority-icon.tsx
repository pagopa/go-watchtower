import { createElement } from 'react'
import { getPriorityIcon } from '@/lib/priority-presentation'

/**
 * Rende l'icona associata a un token di priorità.
 *
 * `createElement` invece di `<Icon />`: l'icona arriva da una mappa a livello di
 * modulo ed è quindi stabile, ma il compiler non la può seguire attraverso la
 * chiamata a `getPriorityIcon` e la tratta come un componente creato durante il
 * render (`react-hooks/static-components`). Tenendo qui l'unico punto in cui
 * l'icona diventa elemento, i chiamanti scrivono JSX normale.
 */
export function PriorityIcon({
  icon,
  className,
}: {
  icon: string | null | undefined
  className?: string
}) {
  return createElement(getPriorityIcon(icon), { className })
}

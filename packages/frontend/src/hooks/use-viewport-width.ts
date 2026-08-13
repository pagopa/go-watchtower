'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('resize', onStoreChange)
  return () => window.removeEventListener('resize', onStoreChange)
}

const getSnapshot = (): number => window.innerWidth

// Sul server la finestra non esiste. Restituendo `null` anche al primo render
// del client, l'HTML idratato combacia con quello generato dal server e React
// applica la misura vera subito dopo l'idratazione.
const getServerSnapshot = (): number | null => null

/**
 * Larghezza del viewport in px, aggiornata al resize della finestra.
 * Vale `null` finché il componente non è idratato.
 */
export function useViewportWidth(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

'use client'

import { ArrowDownRight } from 'lucide-react'
import { api, type Downstream } from '@/lib/api-client'
import { SimpleNamedResourceTab } from './simple-named-resource-tab'

interface DownstreamsTabProps {
  productId: string
}

export function DownstreamsTab({ productId }: DownstreamsTabProps) {
  return (
    <SimpleNamedResourceTab<Downstream>
      productId={productId}
      permission="DOWNSTREAM"
      queryKey="downstreams"
      labels={{
        plural: 'downstream',
        createButton: 'Nuovo Downstream',
        emptyTitle: 'Nessun downstream configurato',
        emptyDescription: 'Aggiungi un downstream per iniziare.',
        createSuccess: 'Downstream creato con successo',
        updateSuccess: 'Downstream aggiornato con successo',
        deleteSuccess: 'Downstream eliminato con successo',
        loadError: 'Errore durante il caricamento dei downstream.',
        dialogCreateTitle: 'Nuovo Downstream',
        dialogEditTitle: 'Modifica Downstream',
        dialogCreateDescription: 'Aggiungi un nuovo downstream al prodotto.',
        dialogEditDescription: 'Modifica i dettagli del downstream.',
        namePlaceholder: 'es. payment-gateway, external-api',
        descriptionPlaceholder: 'Descrizione opzionale del downstream',
        deleteDialogDescription: (item) =>
          `Sei sicuro di voler eliminare il downstream "${item?.name}"? Questa azione non può essere annullata.`,
      }}
      emptyIcon={ArrowDownRight}
      queryFn={api.getDownstreams}
      createFn={api.createDownstream}
      updateFn={api.updateDownstream}
      deleteFn={api.deleteDownstream}
    />
  )
}

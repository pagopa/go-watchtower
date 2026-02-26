'use client'

import { Box } from 'lucide-react'
import { api, type Microservice } from '@/lib/api-client'
import { SimpleNamedResourceTab } from './simple-named-resource-tab'

interface MicroservicesTabProps {
  productId: string
}

export function MicroservicesTab({ productId }: MicroservicesTabProps) {
  return (
    <SimpleNamedResourceTab<Microservice>
      productId={productId}
      permission="MICROSERVICE"
      queryKey="microservices"
      labels={{
        plural: 'microservizi',
        createButton: 'Nuovo Microservizio',
        emptyTitle: 'Nessun microservizio configurato',
        emptyDescription: 'Aggiungi un microservizio per iniziare.',
        createSuccess: 'Microservizio creato con successo',
        updateSuccess: 'Microservizio aggiornato con successo',
        deleteSuccess: 'Microservizio eliminato con successo',
        loadError: 'Errore durante il caricamento dei microservizi.',
        dialogCreateTitle: 'Nuovo Microservizio',
        dialogEditTitle: 'Modifica Microservizio',
        dialogCreateDescription: 'Aggiungi un nuovo microservizio al prodotto.',
        dialogEditDescription: 'Modifica i dettagli del microservizio.',
        namePlaceholder: 'es. api-gateway, user-service',
        descriptionPlaceholder: 'Descrizione opzionale del microservizio',
        deleteDialogDescription: (item) =>
          `Sei sicuro di voler eliminare il microservizio "${item?.name}"? Questa azione non può essere annullata.`,
      }}
      emptyIcon={Box}
      queryFn={api.getMicroservices}
      createFn={api.createMicroservice}
      updateFn={(id, itemId, data) => api.updateMicroservice(id, itemId, { name: data.name, description: data.description })}
      deleteFn={api.deleteMicroservice}
    />
  )
}

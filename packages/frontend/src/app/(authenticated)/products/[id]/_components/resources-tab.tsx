'use client'

import { Box } from 'lucide-react'
import { api, type ProductResource } from '@/lib/api-client'
import { SimpleNamedResourceTab } from './simple-named-resource-tab'

interface ResourcesTabProps {
  productId: string
}

export function ResourcesTab({ productId }: ResourcesTabProps) {
  return (
    <SimpleNamedResourceTab<ProductResource>
      productId={productId}
      permission="RESOURCE"
      queryKey="resources"
      labels={{
        plural: 'risorse',
        createButton: 'Nuova Risorsa',
        emptyTitle: 'Nessuna risorsa configurata',
        emptyDescription: 'Aggiungi una risorsa per iniziare.',
        createSuccess: 'Risorsa creata con successo',
        updateSuccess: 'Risorsa aggiornata con successo',
        deleteSuccess: 'Risorsa eliminata con successo',
        loadError: 'Errore durante il caricamento delle risorse.',
        dialogCreateTitle: 'Nuova Risorsa',
        dialogEditTitle: 'Modifica Risorsa',
        dialogCreateDescription: 'Aggiungi una nuova risorsa al prodotto.',
        dialogEditDescription: 'Modifica i dettagli della risorsa.',
        namePlaceholder: 'es. api-gateway, user-service',
        descriptionPlaceholder: 'Descrizione opzionale della risorsa',
        deleteDialogDescription: (item) =>
          `Sei sicuro di voler eliminare la risorsa "${item?.name}"? Questa azione non può essere annullata.`,
      }}
      emptyIcon={Box}
      queryFn={api.getResources}
      createFn={api.createResource}
      updateFn={(id, itemId, data) => api.updateResource(id, itemId, { name: data.name, description: data.description })}
      deleteFn={api.deleteResource}
    />
  )
}

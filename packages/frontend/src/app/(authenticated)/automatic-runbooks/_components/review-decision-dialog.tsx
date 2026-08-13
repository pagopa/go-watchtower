'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MAX_NOTE_LENGTH = 2000

interface ReviewDecisionDialogProps {
  readonly open: boolean
  readonly decision: 'CONFIRMED' | 'REJECTED'
  /** Stato che verrà applicato dalla conferma; assente per gli esiti unknown. */
  readonly proposedStatus?: 'IN_PROGRESS' | 'COMPLETED' | undefined
  readonly pending: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: (note: string) => void
}

/**
 * Raccoglie la decisione umana sull'esito automatico.
 *
 * La nota è **obbligatoria sul rifiuto**: un'analisi automatica scartata senza
 * motivazione non è ispezionabile a posteriori. Sulla conferma è facoltativa.
 */
export function ReviewDecisionDialog({
  open,
  decision,
  proposedStatus,
  pending,
  onOpenChange,
  onConfirm,
}: ReviewDecisionDialogProps) {
  const [note, setNote] = useState('')
  const isReject = decision === 'REJECTED'
  const trimmed = note.trim()
  const noteMissing = isReject && trimmed === ''

  const handleOpenChange = (next: boolean) => {
    if (!next) setNote('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isReject ? 'Rifiuta la proposta automatica' : 'Conferma la proposta automatica'}</DialogTitle>
          <DialogDescription>
            {isReject
              ? "L'analisi resta consultabile per audit ma non viene validata, e l'allarme resta aperto."
              : describeConfirm(proposedStatus)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="review-note">
            Nota {isReject ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(facoltativa)</span>}
          </Label>
          <Textarea
            id="review-note"
            value={note}
            maxLength={MAX_NOTE_LENGTH}
            rows={4}
            placeholder={isReject ? 'Perché la proposta non è corretta?' : 'Eventuali note per chi leggerà l’analisi'}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {trimmed.length}/{MAX_NOTE_LENGTH}
            {noteMissing ? ' — obbligatoria per il rifiuto' : ''}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
            Annulla
          </Button>
          <Button
            variant={isReject ? 'destructive' : 'default'}
            disabled={pending || noteMissing}
            onClick={() => onConfirm(trimmed)}
          >
            {isReject ? 'Rifiuta' : 'Conferma'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function describeConfirm(proposedStatus: 'IN_PROGRESS' | 'COMPLETED' | undefined): string {
  if (proposedStatus === 'COMPLETED') {
    return "L'analisi verrà completata e l'allarme risolto, in un'unica transazione."
  }
  if (proposedStatus === 'IN_PROGRESS') {
    return "L'analisi resta in lavorazione e l'allarme resta aperto: la conferma valida il contenuto."
  }
  return "La conferma valida l'esito automatico."
}

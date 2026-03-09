import type { QualityRule } from '../../types.js';

export const documentationRules: QualityRule[] = [
  {
    id: 'QUALITY_CONCLUSION_NOTES',
    weight: 2,
    label: 'Note conclusive',
    hint: "Aggiungi note conclusive per documentare l'esito dell'analisi",
    assess: (a) => a.conclusionNotes != null && a.conclusionNotes.trim() !== '',
  },
  {
    id: 'QUALITY_RUNBOOK_LINKED',
    weight: 2,
    label: 'Runbook collegato',
    hint: 'Collega un runbook per documentare la procedura di risoluzione',
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    assess: (a) => a.runbook != null,
  },
  {
    id: 'QUALITY_ONCALL_NOTES',
    weight: 2,
    label: 'Note reperibilità',
    hint: 'Documenta con note conclusive gli interventi in reperibilità',
    appliesTo: (a) => a.isOnCall === true,
    assess: (a) => a.conclusionNotes != null && a.conclusionNotes.trim() !== '',
  },
  {
    id: 'QUALITY_ERROR_DETAILS',
    weight: 1.5,
    label: 'Dettagli errore',
    hint: "Aggiungi i dettagli dell'errore nel campo dedicato o nella descrizione di un ID tracciamento",
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    assess: (a) =>
      (a.errorDetails != null && a.errorDetails.trim() !== '') ||
      a.trackingIds.some((t) => t.errorDetail != null && t.errorDetail.trim() !== ''),
  },
  {
    id: 'QUALITY_DOWNSTREAMS',
    weight: 1,
    label: 'Downstream',
    hint: "Specifica i sistemi downstream impattati dall'allarme",
    appliesTo: (a) => a.analysisType === 'ANALYZABLE',
    assess: (a) => a.downstreams.length > 0,
  },
];

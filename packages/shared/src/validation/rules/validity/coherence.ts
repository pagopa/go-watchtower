import type { ValidationRule } from '../../types.js';

export const coherenceRules: ValidationRule[] = [
  {
    id: 'HIGH_OCCURRENCES_WITHOUT_DOWNSTREAM',
    severity: 'warning',
    weight: 1,
    message: 'Alto numero di occorrenze senza downstream specificati',
    validate: (a) => !(a.occurrences > 10 && a.downstreams.length === 0),
  },
  {
    id: 'LINKED_EVENTS_MISMATCH_OCCURRENCES',
    severity: 'error',
    weight: 3,
    message: (a) =>
      `Il numero di alarm events collegati (${a.linkedEventsCount}) non corrisponde alle occorrenze (${a.occurrences})`,
    appliesTo: (a) => a.linkedEventsCount != null && a.linkedEventsCount > 0,
    validate: (a) => a.linkedEventsCount === a.occurrences,
  },
];

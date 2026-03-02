import type { ValidationRule } from '../../types.js';

export const coherenceRules: ValidationRule[] = [
  {
    id: 'HIGH_OCCURRENCES_WITHOUT_DOWNSTREAM',
    severity: 'warning',
    weight: 1,
    message: 'Alto numero di occorrenze senza downstream specificati',
    validate: (a) => !(a.occurrences > 10 && a.downstreams.length === 0),
  },
];

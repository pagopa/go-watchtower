import type { ValidationRule } from '../../types.js';

export const trackingRules: ValidationRule[] = [
  {
    id: 'TRACKING_ERROR_CODE',
    severity: 'warning',
    weight: 1,
    message: (a) => {
      const missing = a.trackingIds.filter(
        (t) => !t.errorCode || t.errorCode.trim() === ''
      ).length;
      return missing === 1
        ? 'Un ID di tracciamento è privo di codice errore'
        : `${missing} ID di tracciamento sono privi di codice errore`;
    },
    appliesTo: (a) => a.trackingIds.length > 0,
    validate: (a) =>
      a.trackingIds.every((t) => t.errorCode && t.errorCode.trim() !== ''),
  },
  {
    id: 'TRACKING_ERROR_DETAIL',
    severity: 'warning',
    weight: 1,
    message: (a) => {
      const missing = a.trackingIds.filter(
        (t) => !t.errorDetail || t.errorDetail.trim() === ''
      ).length;
      return missing === 1
        ? 'Un ID di tracciamento è privo di dettaglio errore'
        : `${missing} ID di tracciamento sono privi di dettaglio errore`;
    },
    appliesTo: (a) => a.trackingIds.length > 0,
    validate: (a) =>
      a.trackingIds.every((t) => t.errorDetail && t.errorDetail.trim() !== ''),
  },
  {
    id: 'DUPLICATE_TRACKING_ERROR_CODE',
    severity: 'warning',
    weight: 1,
    message: 'Sono presenti ID di tracciamento con codice errore duplicato',
    appliesTo: (a) =>
      a.trackingIds.length > 1 &&
      a.trackingIds.some((t) => t.errorCode && t.errorCode.trim() !== ''),
    validate: (a) => {
      const codes = a.trackingIds
        .map((t) => t.errorCode)
        .filter((c): c is string => c != null && c.trim() !== '');
      return new Set(codes).size === codes.length;
    },
  },
  {
    id: 'TRACKING_TIMESTAMP_FUTURE',
    severity: 'warning',
    weight: 1,
    message: 'Un ID di tracciamento ha un timestamp nel futuro',
    appliesTo: (a) =>
      a.trackingIds.some((t) => t.timestamp != null && t.timestamp.trim() !== ''),
    validate: (a) => {
      const now = new Date();
      return a.trackingIds
        .filter((t) => t.timestamp != null && t.timestamp.trim() !== '')
        .every((t) => new Date(t.timestamp!) <= now);
    },
  },
];

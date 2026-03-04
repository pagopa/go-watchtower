import { Resources } from '../constants/resources.js';
import type { Resource } from '../constants/resources.js';

export const RESOURCE_LABELS: Record<Resource, string> = {
  PRODUCT:        'Prodotti',
  ENVIRONMENT:    'Ambienti',
  MICROSERVICE:   'Microservizi',
  IGNORED_ALARM:  'Allarmi ignorati',
  RUNBOOK:        'Runbook',
  FINAL_ACTION:   'Azioni finali',
  ALARM:          'Allarmi',
  ALARM_ANALYSIS: 'Analisi allarmi',
  ALARM_EVENT:    'Allarmi scattati',
  DOWNSTREAM:     'Downstream',
  USER:           'Utenti',
  SYSTEM_SETTING: 'Impostazioni di sistema',
};

/** Tutte le risorse esclusa SYSTEM_SETTING, nell'ordine canonico. */
export const DISPLAY_RESOURCES = (Object.values(Resources) as Resource[]).filter(
  (r) => r !== Resources.SYSTEM_SETTING,
);

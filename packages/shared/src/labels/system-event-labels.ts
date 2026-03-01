import { SystemEventResources } from '../constants/system-event-resources.js';
import type { SystemEventResource } from '../constants/system-event-resources.js';
import { SystemEventActions } from '../constants/system-event-actions.js';
import type { SystemEventAction } from '../constants/system-event-actions.js';

export const SYSTEM_EVENT_RESOURCE_LABELS: Record<SystemEventResource, string> = {
  [SystemEventResources.AUTH]:                      'Auth',
  [SystemEventResources.USERS]:                     'Utenti',
  [SystemEventResources.ALARM_ANALYSES]:            'Analisi',
  [SystemEventResources.SYSTEM_SETTINGS]:           'Impostazioni',
  [SystemEventResources.PRODUCTS]:                  'Prodotti',
  [SystemEventResources.ALARMS]:                    'Allarmi',
  [SystemEventResources.IGNORED_ALARMS]:            'Allarmi Ignorati',
  [SystemEventResources.USER_PERMISSION_OVERRIDES]: 'Override Permessi',
};

export const SYSTEM_EVENT_ACTION_LABELS: Partial<Record<SystemEventAction, string>> = {
  [SystemEventActions.USER_LOGIN]:                  'Login',
  [SystemEventActions.USER_LOGIN_GOOGLE]:           'Login Google',
  [SystemEventActions.USER_LOGIN_FAILED]:           'Login Fallito',
  [SystemEventActions.USER_LOGOUT]:                 'Logout',
  [SystemEventActions.USER_TOKEN_REVOKED]:          'Token Revocato',
  [SystemEventActions.USER_CREATED]:                'Utente Creato',
  [SystemEventActions.USER_UPDATED]:                'Utente Aggiornato',
  [SystemEventActions.USER_ACTIVATED]:              'Utente Attivato',
  [SystemEventActions.USER_DEACTIVATED]:            'Utente Disattivato',
  [SystemEventActions.USER_DELETED]:                'Utente Eliminato',
  [SystemEventActions.USER_PASSWORD_CHANGED]:       'Password Cambiata',
  [SystemEventActions.USER_ROLE_CHANGED]:           'Ruolo Cambiato',
  [SystemEventActions.PERMISSION_OVERRIDE_CREATED]: 'Override Creato',
  [SystemEventActions.PERMISSION_OVERRIDE_UPDATED]: 'Override Aggiornato',
  [SystemEventActions.PERMISSION_OVERRIDE_DELETED]: 'Override Eliminato',
  [SystemEventActions.ANALYSIS_CREATED]:            'Analisi Creata',
  [SystemEventActions.ANALYSIS_UPDATED]:            'Analisi Aggiornata',
  [SystemEventActions.ANALYSIS_DELETED]:            'Analisi Eliminata',
  [SystemEventActions.ANALYSIS_STATUS_CHANGED]:     'Stato Analisi Cambiato',
  [SystemEventActions.SETTING_UPDATED]:             'Impostazione Aggiornata',
  [SystemEventActions.PRODUCT_CREATED]:             'Prodotto Creato',
  [SystemEventActions.PRODUCT_UPDATED]:             'Prodotto Aggiornato',
  [SystemEventActions.PRODUCT_DELETED]:             'Prodotto Eliminato',
  [SystemEventActions.ALARM_CREATED]:               'Allarme Creato',
  [SystemEventActions.ALARM_UPDATED]:               'Allarme Aggiornato',
  [SystemEventActions.ALARM_DELETED]:               'Allarme Eliminato',
  [SystemEventActions.IGNORED_ALARM_CREATED]:       'Allarme Ignorato Creato',
  [SystemEventActions.IGNORED_ALARM_UPDATED]:       'Allarme Ignorato Aggiornato',
  [SystemEventActions.IGNORED_ALARM_DELETED]:       'Allarme Ignorato Eliminato',
};

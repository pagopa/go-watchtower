import type { Theme } from '../constants/themes.js';

export interface ColumnSettings {
  visible?: string[];
  order?: string[];
  widths?: Record<string, number>;
  renames?: Record<string, string>;
}

export interface PriorityNotificationPreferences {
  enabledCodes: string[];
}

export interface NotificationPreferences {
  enabled: boolean;
  priority?: PriorityNotificationPreferences;
  // Legacy notification toggles kept for compatibility during migration.
  // Le chiavi note sono i valori di `NotificationType`, ma il record resta
  // aperto per quelle già salvate: unire i due tipi non aggiungeva nulla,
  // perché `string` assorbe le costanti.
  types?: Partial<Record<string, boolean>>;
}

export interface UserPreferences {
  [key: string]: unknown;
  theme?: Theme;
  lastRoute?: string;
  columnSettings?: Record<string, ColumnSettings>;
  savedFilters?: Record<string, Record<string, unknown>>;
  pageSize?: number;
  locale?: string;
  sidebarCollapsed?: boolean;
  analysisFiltersCollapsed?: boolean;
  alarmEventFiltersCollapsed?: boolean;
  alarmEventViewMode?: 'list' | 'daily' | 'oncall' | 'grouped';
  analysisViewMode?: 'list' | 'daily' | 'oncall';
  /**
   * @deprecated Larghezza unica condivisa da tutti i pannelli di dettaglio.
   * Sostituita da `panelWidths`, che tiene una larghezza per pannello: viene
   * ancora letta come fallback per non azzerare la preferenza degli utenti
   * esistenti al primo caricamento dopo la migrazione.
   */
  detailPanelWidth?: number;
  /** Larghezza in px di ogni pannello ridimensionabile, per chiave. */
  panelWidths?: Record<string, number>;
  notifications?: NotificationPreferences;
}

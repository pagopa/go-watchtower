import type { Theme } from '../constants/themes.js';
import type { NotificationType } from '../constants/notification-registry.js';

export interface ColumnSettings {
  visible?: string[];
  order?: string[];
  widths?: Record<string, number>;
  renames?: Record<string, string>;
}

export interface NotificationPreferences {
  enabled: boolean;
  types: Partial<Record<NotificationType, boolean>>;
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
  detailPanelWidth?: number;
  notifications?: NotificationPreferences;
}

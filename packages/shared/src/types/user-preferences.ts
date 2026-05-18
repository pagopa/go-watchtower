import type { Theme } from '../constants/themes.js';
import type { NotificationType } from '../constants/notification-registry.js';

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
  types?: Partial<Record<NotificationType | string, boolean>>;
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

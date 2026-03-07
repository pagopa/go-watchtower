import type { Theme } from '../constants/themes.js';

export interface ColumnSettings {
  visible?: string[];
  order?: string[];
  widths?: Record<string, number>;
  renames?: Record<string, string>;
}

export interface UserPreferences {
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
  detailPanelWidth?: number;
}

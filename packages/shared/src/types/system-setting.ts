import type { SettingType } from '../constants/setting-types.js';
import type { SettingCategory } from '../constants/setting-categories.js';
import type { SettingFormat } from '../constants/setting-formats.js';
import type { WorkingHours } from './working-hours.js';

interface SystemSettingBase {
  id:          string;
  key:         string;
  type:        SettingType;
  format:      SettingFormat | null;
  category:    SettingCategory;
  label:       string;
  description: string | null;
  updatedById: string | null;
  createdAt:   string;
  updatedAt:   string;
}

export interface GenericSystemSetting extends SystemSettingBase {
  format: null;
  value:  unknown;
}

export interface WorkingHoursSystemSetting extends SystemSettingBase {
  type:   'JSON';
  format: 'WORKING_HOURS';
  value:  WorkingHours;
}

export type SystemSetting = GenericSystemSetting | WorkingHoursSystemSetting;

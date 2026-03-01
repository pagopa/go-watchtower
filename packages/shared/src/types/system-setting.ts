import type { SettingType } from '../constants/setting-types.js';
import type { SettingCategory } from '../constants/setting-categories.js';

export interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  type: SettingType;
  category: SettingCategory;
  label: string;
  description: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

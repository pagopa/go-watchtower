import type { SystemSetting, WorkingHoursSystemSetting, FkSystemSetting } from '../types/system-setting.js';
import type { FkSettingFormat } from '../constants/setting-formats.js';
import { FK_SETTING_FORMATS } from '../constants/setting-formats.js';

export function isWorkingHoursSetting(s: SystemSetting): s is WorkingHoursSystemSetting {
  return s.format === 'WORKING_HOURS';
}

export function isFkSetting(s: SystemSetting): s is FkSystemSetting {
  return s.format !== null && (FK_SETTING_FORMATS as string[]).includes(s.format);
}

export function isFkSettingOf<TFormat extends FkSettingFormat>(
  s: SystemSetting,
  format: TFormat,
): s is FkSystemSetting<TFormat> {
  return s.format === format;
}

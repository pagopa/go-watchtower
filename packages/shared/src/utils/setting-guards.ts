import type { SystemSetting, WorkingHoursSystemSetting } from '../types/system-setting.js';

export function isWorkingHoursSetting(s: SystemSetting): s is WorkingHoursSystemSetting {
  return s.format === 'WORKING_HOURS';
}

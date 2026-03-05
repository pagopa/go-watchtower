export const SettingFormats = {
  WORKING_HOURS:  'WORKING_HOURS',
  ON_CALL_HOURS:  'ON_CALL_HOURS',
  FK_ROLE:        'FK_ROLE',
} as const;

export type SettingFormat   = typeof SettingFormats[keyof typeof SettingFormats];
export type FkSettingFormat = Extract<SettingFormat, `FK_${string}`>;

export const FK_SETTING_FORMATS = Object.values(SettingFormats).filter(
  (f): f is FkSettingFormat => f.startsWith('FK_'),
);

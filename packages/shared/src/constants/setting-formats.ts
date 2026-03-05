export const SettingFormats = {
  WORKING_HOURS: 'WORKING_HOURS',
} as const;

export type SettingFormat = typeof SettingFormats[keyof typeof SettingFormats];

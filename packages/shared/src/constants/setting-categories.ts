export const SettingCategories = {
  AUTH:     'AUTH',
  ANALYSIS: 'ANALYSIS',
  SYSTEM:   'SYSTEM',
  UI:       'UI',
} as const;

export type SettingCategory = typeof SettingCategories[keyof typeof SettingCategories];

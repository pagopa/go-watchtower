export const SettingTypes = {
  STRING:  'STRING',
  NUMBER:  'NUMBER',
  BOOLEAN: 'BOOLEAN',
  JSON:    'JSON',
} as const;

export type SettingType = typeof SettingTypes[keyof typeof SettingTypes];

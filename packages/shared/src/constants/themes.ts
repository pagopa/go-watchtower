export const Themes = {
  LIGHT:  'light',
  DARK:   'dark',
  SYSTEM: 'system',
} as const;

export type Theme = typeof Themes[keyof typeof Themes];

export const THEME_VALUES = Object.values(Themes) as [Theme, ...Theme[]];

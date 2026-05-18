export const AlertPriorityCodes = {
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  ON_CALL: 'ON_CALL',
} as const;

export type AlertPriorityCode = typeof AlertPriorityCodes[keyof typeof AlertPriorityCodes];

export const LegacyAlertPriorityCodes = {
  HIGH_PRIORITY: 'HIGH_PRIORITY',
} as const;

export type LegacyAlertPriorityCode =
  typeof LegacyAlertPriorityCodes[keyof typeof LegacyAlertPriorityCodes];

export function normalizeAlertPriorityCode(code: string): string {
  return code === LegacyAlertPriorityCodes.HIGH_PRIORITY ? AlertPriorityCodes.HIGH : code;
}

export const ALERT_PRIORITY_CODE_VALUES = Object.values(AlertPriorityCodes) as [
  AlertPriorityCode,
  ...AlertPriorityCode[],
];

export const AlarmPriorityMatcherTypes = {
  ALARM_ID: 'ALARM_ID',
  ALARM_NAME_PREFIX: 'ALARM_NAME_PREFIX',
  ALARM_NAME_REGEX: 'ALARM_NAME_REGEX',
} as const;

export type AlarmPriorityMatcherType =
  typeof AlarmPriorityMatcherTypes[keyof typeof AlarmPriorityMatcherTypes];

export const ALARM_PRIORITY_MATCHER_TYPE_VALUES = Object.values(AlarmPriorityMatcherTypes) as [
  AlarmPriorityMatcherType,
  ...AlarmPriorityMatcherType[],
];

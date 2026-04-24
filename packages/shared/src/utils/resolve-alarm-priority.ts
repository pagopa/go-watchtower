import { AlertPriorityCodes, AlarmPriorityMatcherTypes } from '../constants/priority.js';
import type { AlertPriorityLevel, AlarmPriorityRule } from '../types/priority.js';
import { matchesTimeConstraints } from './time-constraints.js';

export interface ResolveAlarmPriorityParams {
  productId: string;
  environmentId: string;
  alarmId?: string | null;
  alarmName: string;
  firedAt: Date | string;
  rules: AlarmPriorityRule[];
  levels: AlertPriorityLevel[];
}

export interface ResolvedAlarmPriority {
  level: AlertPriorityLevel;
  rule: AlarmPriorityRule | null;
  matched: boolean;
}

const FALLBACK_NORMAL_LEVEL: AlertPriorityLevel = {
  code: AlertPriorityCodes.NORMAL,
  label: 'Normale',
  description: 'Priorita operativa standard',
  rank: 0,
  color: 'zinc',
  icon: 'minus',
  isActive: true,
  isDefault: true,
  countsAsOnCall: false,
  defaultNotify: false,
  isSystem: true,
};

function getDefaultLevel(levels: AlertPriorityLevel[]): AlertPriorityLevel {
  return levels.find((level) => level.isDefault && level.isActive)
    ?? levels.find((level) => level.code === AlertPriorityCodes.NORMAL)
    ?? FALLBACK_NORMAL_LEVEL;
}

function getSpecificity(rule: AlarmPriorityRule): number {
  const base = rule.matcherType === AlarmPriorityMatcherTypes.ALARM_ID
    ? 300
    : rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_PREFIX
      ? 200
      : 100;

  return base + (rule.environmentId ? 10 : 0);
}

function matchesRule(rule: AlarmPriorityRule, params: ResolveAlarmPriorityParams, firedAt: Date): boolean {
  if (!rule.isActive || rule.productId !== params.productId) return false;
  if (rule.environmentId && rule.environmentId !== params.environmentId) return false;

  if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_ID) {
    if (!params.alarmId || !rule.alarmId || rule.alarmId !== params.alarmId) return false;
  } else if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_PREFIX) {
    if (!rule.namePrefix || !params.alarmName.startsWith(rule.namePrefix)) return false;
  } else if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_REGEX) {
    if (!rule.namePattern) return false;
    try {
      if (!new RegExp(rule.namePattern).test(params.alarmName)) return false;
    } catch {
      return false;
    }
  } else {
    return false;
  }

  if (!matchesTimeConstraints(firedAt, rule.validity)) return false;
  if (rule.exclusions.length > 0 && matchesTimeConstraints(firedAt, rule.exclusions)) return false;

  return true;
}

function compareCreatedAtAsc(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

export function resolveAlarmPriority(params: ResolveAlarmPriorityParams): ResolvedAlarmPriority {
  const firedAt = params.firedAt instanceof Date ? params.firedAt : new Date(params.firedAt);
  if (Number.isNaN(firedAt.getTime())) {
    return { level: getDefaultLevel(params.levels), rule: null, matched: false };
  }

  const levelMap = new Map(
    params.levels
      .filter((level) => level.isActive)
      .map((level) => [level.code, level] as const),
  );

  const defaultLevel = getDefaultLevel(params.levels);

  const matches = params.rules
    .filter((rule) => {
      const level = levelMap.get(rule.priorityCode);
      if (!level) return false;
      return matchesRule(rule, params, firedAt);
    })
    .sort((a, b) => {
      const specificityDiff = getSpecificity(b) - getSpecificity(a);
      if (specificityDiff !== 0) return specificityDiff;

      const precedenceDiff = b.precedence - a.precedence;
      if (precedenceDiff !== 0) return precedenceDiff;

      const rankDiff = (levelMap.get(b.priorityCode)?.rank ?? 0) - (levelMap.get(a.priorityCode)?.rank ?? 0);
      if (rankDiff !== 0) return rankDiff;

      return compareCreatedAtAsc(a.createdAt, b.createdAt);
    });

  const selectedRule = matches[0];
  if (!selectedRule) {
    return {
      level: defaultLevel,
      rule: null,
      matched: false,
    };
  }

  return {
    level: levelMap.get(selectedRule.priorityCode) ?? defaultLevel,
    rule: selectedRule,
    matched: true,
  };
}

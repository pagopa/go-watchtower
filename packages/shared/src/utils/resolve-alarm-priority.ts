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

type ResolvedLevelContext = {
  defaultLevel: AlertPriorityLevel;
  activeLevelMap: Map<string, AlertPriorityLevel>;
};

type CompiledAlarmPriorityRule = {
  rule: AlarmPriorityRule;
  createdAtMs: number | null;
  specificity: number;
  nameRegex: RegExp | null;
  regexValid: boolean;
};

const levelContextCache = new WeakMap<AlertPriorityLevel[], ResolvedLevelContext>();
const compiledRuleCache = new WeakMap<AlarmPriorityRule[], CompiledAlarmPriorityRule[]>();

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

function parseCreatedAtMs(createdAt?: string): number | null {
  if (!createdAt) return null;

  const parsed = new Date(createdAt).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getLevelContext(levels: AlertPriorityLevel[]): ResolvedLevelContext {
  const cached = levelContextCache.get(levels);
  if (cached) return cached;

  const context = {
    defaultLevel: getDefaultLevel(levels),
    activeLevelMap: new Map(
      levels
        .filter((level) => level.isActive)
        .map((level) => [level.code, level] as const),
    ),
  };

  levelContextCache.set(levels, context);
  return context;
}

function getCompiledRules(rules: AlarmPriorityRule[]): CompiledAlarmPriorityRule[] {
  const cached = compiledRuleCache.get(rules);
  if (cached) return cached;

  const compiled = rules.map((rule) => {
    let nameRegex: RegExp | null = null;
    let regexValid = true;

    if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_REGEX) {
      if (!rule.namePattern) {
        regexValid = false;
      } else {
        try {
          nameRegex = new RegExp(rule.namePattern);
        } catch {
          regexValid = false;
        }
      }
    }

    return {
      rule,
      createdAtMs: parseCreatedAtMs(rule.createdAt),
      specificity: getSpecificity(rule),
      nameRegex,
      regexValid,
    };
  });

  compiledRuleCache.set(rules, compiled);
  return compiled;
}

function matchesRule(
  compiledRule: CompiledAlarmPriorityRule,
  params: ResolveAlarmPriorityParams,
  firedAt: Date,
): boolean {
  const { rule } = compiledRule;

  if (!rule.isActive || rule.productId !== params.productId) return false;
  if (rule.environmentId && rule.environmentId !== params.environmentId) return false;

  if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_ID) {
    if (!params.alarmId || !rule.alarmId || rule.alarmId !== params.alarmId) return false;
  } else if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_PREFIX) {
    if (!rule.namePrefix || !params.alarmName.startsWith(rule.namePrefix)) return false;
  } else if (rule.matcherType === AlarmPriorityMatcherTypes.ALARM_NAME_REGEX) {
    if (!compiledRule.regexValid || !compiledRule.nameRegex) return false;
    compiledRule.nameRegex.lastIndex = 0;
    if (!compiledRule.nameRegex.test(params.alarmName)) return false;
  } else {
    return false;
  }

  if (!matchesTimeConstraints(firedAt, rule.validity)) return false;
  if (rule.exclusions.length > 0 && matchesTimeConstraints(firedAt, rule.exclusions)) return false;

  return true;
}

function compareCompiledRules(
  candidate: CompiledAlarmPriorityRule,
  current: CompiledAlarmPriorityRule,
  levelMap: Map<string, AlertPriorityLevel>,
): number {
  const specificityDiff = candidate.specificity - current.specificity;
  if (specificityDiff !== 0) return specificityDiff;

  const precedenceDiff = candidate.rule.precedence - current.rule.precedence;
  if (precedenceDiff !== 0) return precedenceDiff;

  const rankDiff =
    (levelMap.get(candidate.rule.priorityCode)?.rank ?? 0)
    - (levelMap.get(current.rule.priorityCode)?.rank ?? 0);
  if (rankDiff !== 0) return rankDiff;

  if (candidate.createdAtMs == null && current.createdAtMs == null) return 0;
  if (candidate.createdAtMs == null) return -1;
  if (current.createdAtMs == null) return 1;

  return current.createdAtMs - candidate.createdAtMs;
}

export function resolveAlarmPriority(params: ResolveAlarmPriorityParams): ResolvedAlarmPriority {
  const firedAt = params.firedAt instanceof Date ? params.firedAt : new Date(params.firedAt);
  if (Number.isNaN(firedAt.getTime())) {
    return { level: getDefaultLevel(params.levels), rule: null, matched: false };
  }

  const { activeLevelMap, defaultLevel } = getLevelContext(params.levels);
  const compiledRules = getCompiledRules(params.rules);

  let selectedRule: CompiledAlarmPriorityRule | null = null;

  for (const compiledRule of compiledRules) {
    const level = activeLevelMap.get(compiledRule.rule.priorityCode);
    if (!level) continue;
    if (!matchesRule(compiledRule, params, firedAt)) continue;

    if (
      !selectedRule
      || compareCompiledRules(compiledRule, selectedRule, activeLevelMap) > 0
    ) {
      selectedRule = compiledRule;
    }
  }

  if (!selectedRule) {
    return {
      level: defaultLevel,
      rule: null,
      matched: false,
    };
  }

  return {
    level: activeLevelMap.get(selectedRule.rule.priorityCode) ?? defaultLevel,
    rule: selectedRule.rule,
    matched: true,
  };
}

import type { TimeConstraint } from './time-constraint.js';
import type { AlarmPriorityMatcherType } from '../constants/priority.js';

export interface AlertPriorityLevel {
  code: string;
  label: string;
  description: string | null;
  rank: number;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  isDefault: boolean;
  countsAsOnCall: boolean;
  defaultNotify: boolean;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AlarmPriorityRule {
  id: string;
  productId: string;
  environmentId: string | null;
  priorityCode: string;
  name: string;
  matcherType: AlarmPriorityMatcherType;
  alarmId: string | null;
  namePrefix: string | null;
  namePattern: string | null;
  precedence: number;
  note: string | null;
  isActive: boolean;
  validity: TimeConstraint[];
  exclusions: TimeConstraint[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AlarmEventPriority {
  code: string;
  label: string;
  rank: number;
  color: string | null;
  icon: string | null;
  countsAsOnCall: boolean;
  isDefault: boolean;
  ruleId: string | null;
  ruleName?: string | null;
  resolvedAt: string | null;
}

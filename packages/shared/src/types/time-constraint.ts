export interface TimeConstraintPeriod {
  start: string;
  end: string;
}

export interface TimeConstraintHours {
  start: string;
  end: string;
}

export interface TimeConstraint {
  periods?: TimeConstraintPeriod[];
  weekdays?: number[];
  hours?: TimeConstraintHours[];
}

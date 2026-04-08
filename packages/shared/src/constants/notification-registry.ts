// ── Notification Definitions Registry ────────────────────────────────────────
//
// Single source of truth for all notification types. Adding a new notification
// requires adding one entry here — UI components, profile settings, and the
// supervisor all derive their data from this registry.

export interface NotificationDefinition {
  readonly category: string
  readonly label: string
  readonly description: string
  readonly defaultEnabled: boolean
}

export const NOTIFICATION_DEFINITIONS = {
  ON_CALL_ALARM: {
    category: 'ALARM_EVENTS',
    label: 'Allarmi on-call',
    description: 'Notifica quando arriva un nuovo allarme on-call',
    defaultEnabled: true,
  },
  HIGH_PRIORITY_ALARM: {
    category: 'ALARM_EVENTS',
    label: 'Allarmi priorità alta',
    description: 'Notifica quando arriva un nuovo allarme priorità alta',
    defaultEnabled: true,
  },
} as const satisfies Record<string, NotificationDefinition>;

// ── Derived types ────────────────────────────────────────────────────────────

export type NotificationType = keyof typeof NOTIFICATION_DEFINITIONS;

export const NOTIFICATION_TYPE_VALUES = Object.keys(NOTIFICATION_DEFINITIONS) as
  [NotificationType, ...NotificationType[]];

// ── Derived category helpers ─────────────────────────────────────────────────

/** All distinct categories present in the registry. */
export const NOTIFICATION_CATEGORIES = [
  ...new Set(Object.values(NOTIFICATION_DEFINITIONS).map((d) => d.category)),
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Category labels (Italian). */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  ALARM_EVENTS: 'Allarmi scattati',
};

/** Map category → notification type keys belonging to it. */
export function getTypesForCategory(category: NotificationCategory): NotificationType[] {
  return (Object.entries(NOTIFICATION_DEFINITIONS) as [NotificationType, NotificationDefinition][])
    .filter(([, def]) => def.category === category)
    .map(([key]) => key);
}

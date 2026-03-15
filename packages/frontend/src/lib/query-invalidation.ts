import type { QueryClient } from '@tanstack/react-query'
import { qk } from './query-keys'

/**
 * Entities that can be mutated in the application.
 *
 * Each entity maps to one or more query-key roots that must be invalidated
 * when a mutation on that entity succeeds.
 */
type Entity =
  | 'analyses'
  | 'alarmEvents'
  | 'products'
  | 'users'
  | 'roles'
  | 'settings'
  | 'ignoreReasons'
  | 'resourceTypes'
  | 'systemEvents'

/**
 * Dependency graph: when entity X is mutated, invalidate ALL listed key roots.
 *
 * This is the single source of truth for cross-entity invalidation.
 * Each entry lists the `qk.*.root` arrays that should be invalidated.
 */
const INVALIDATION_GRAPH: Record<Entity, readonly (readonly string[])[]> = {
  analyses: [
    qk.analyses.root,
    qk.reports.root,
    qk.alarmEvents.root,   // analysis link status shown on events
  ],
  alarmEvents: [
    qk.alarmEvents.root,
  ],
  products: [
    qk.products.root,
  ],
  users: [
    qk.users.root,
  ],
  roles: [
    qk.roles.root,
  ],
  settings: [
    qk.settings.root,
  ],
  ignoreReasons: [
    qk.ignoreReasons.root,
  ],
  resourceTypes: [
    qk.resourceTypes.root,
  ],
  systemEvents: [
    qk.systemEvents.root,
  ],
}

/**
 * Invalidate all queries affected by mutations on the given entities.
 *
 * Uses prefix-based invalidation: `invalidateQueries({ queryKey: ['analyses'] })`
 * matches every query whose key starts with `['analyses', ...]`.
 *
 * @example
 * ```ts
 * // After creating an analysis:
 * invalidate(queryClient, 'analyses')
 *
 * // After bulk-ignoring alarm events (touches both entities):
 * invalidate(queryClient, 'alarmEvents', 'analyses')
 * ```
 */
export function invalidate(queryClient: QueryClient, ...entities: Entity[]): void {
  const seen = new Set<string>()

  for (const entity of entities) {
    const roots = INVALIDATION_GRAPH[entity]
    for (const root of roots) {
      const key = root.join('/')
      if (seen.has(key)) continue
      seen.add(key)
      queryClient.invalidateQueries({ queryKey: root })
    }
  }
}

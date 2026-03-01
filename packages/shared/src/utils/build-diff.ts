/**
 * Calcola le differenze tra due oggetti.
 * Restituisce solo i campi effettivamente modificati.
 * Se `fields` e fornito, il confronto e limitato a quei campi.
 */
export function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): Record<string, { before: unknown; after: unknown }> {
  const keys = fields ?? [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (b !== a && JSON.stringify(b) !== JSON.stringify(a)) {
      diff[key] = { before: b, after: a };
    }
  }
  return diff;
}

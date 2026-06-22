import crypto from "node:crypto";
import { WT_COMPLETE_HASH_VERSION } from "@go-watchtower/shared";

/**
 * Canonicalizzazione + hash del payload di `complete`, **interamente di proprietà
 * del backend Watchtower** (EVO-WATCHTINTEG-OPUS-03 §9.7 / CONTRACT-03 §3.2 §4.3).
 *
 * Algoritmo `WT-COMPLETE-SHA256-V1`:
 *  - chiavi degli oggetti ordinate ricorsivamente secondo l'ordine lessicografico
 *    UTF-16 di ECMAScript (`Object.keys(value).sort()`);
 *  - ordine degli array preservato;
 *  - `null` distinto dal campo assente;
 *  - stringhe preservate senza normalizzazione Unicode implicita;
 *  - `JSON.stringify` compatto, encoding UTF-8;
 *  - SHA-256 in hex.
 *
 * Valori runtime non JSON (`Date`, `BigInt`, `undefined`, `NaN`, `Infinity`,
 * funzioni, symbol) NON sono ammessi: il DTO deve già esporre le metriche grandi
 * come stringhe decimali. L'hash non attraversa il confine tra repository e non è
 * accettato dal body worker: è telemetria interna di idempotenza.
 */

export class CanonicalizationError extends Error {
  constructor(message: string, readonly path: string) {
    super(`${message} (at ${path || "<root>"})`);
    this.name = "CanonicalizationError";
  }
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/**
 * Produce la stringa JSON canonica deterministica del valore fornito.
 * Lancia `CanonicalizationError` su valori non rappresentabili in JSON.
 */
export function canonicalizeCompletePayload(value: unknown): string {
  return serialize(value, "");
}

function serialize(value: unknown, path: string): string {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;

  if (valueType === "string") {
    return JSON.stringify(value);
  }

  if (valueType === "boolean") {
    return value ? "true" : "false";
  }

  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError(
        "Non-finite number is not a valid JSON value",
        path,
      );
    }
    // JSON.stringify produces the canonical ECMAScript number representation.
    return JSON.stringify(value);
  }

  if (valueType === "bigint") {
    throw new CanonicalizationError(
      "BigInt is not allowed: serialize large metrics as decimal strings",
      path,
    );
  }

  if (valueType === "undefined") {
    throw new CanonicalizationError(
      "undefined is not a valid JSON value",
      path,
    );
  }

  if (valueType === "function" || valueType === "symbol") {
    throw new CanonicalizationError(`${valueType} is not a valid JSON value`, path);
  }

  if (value instanceof Date) {
    throw new CanonicalizationError(
      "Date instance is not allowed: provide an ISO string",
      path,
    );
  }

  if (Array.isArray(value)) {
    const parts = value.map((item, index) =>
      serialize(item, `${path}[${index}]`),
    );
    return `[${parts.join(",")}]`;
  }

  if (valueType === "object") {
    const record = value as Record<string, unknown>;
    // ECMAScript UTF-16 lexicographic order over own enumerable string keys.
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      const child = record[key];
      // A key explicitly set to `undefined` is rejected (distinct from an absent
      // key, which simply never appears here).
      if (child === undefined) {
        throw new CanonicalizationError(
          "undefined property value is not allowed",
          childPath,
        );
      }
      parts.push(`${JSON.stringify(key)}:${serialize(child, childPath)}`);
    }
    return `{${parts.join(",")}}`;
  }

  // Unreachable: every `typeof` case above is handled. Defensive fallback.
  throw new CanonicalizationError("Unsupported value type", path);
}

export interface CompletionHash {
  readonly hash: string;
  readonly version: string;
}

/**
 * Calcola l'hash di completamento canonico e la versione dell'algoritmo da
 * persistere sull'attempt. La versione è esplicita per consentire replay
 * deterministici futuri (§9.7): uno storico V1 non viene mai ricalcolato con un
 * algoritmo successivo implicito.
 */
export function computeCompletionHash(value: unknown): CompletionHash {
  const canonical = canonicalizeCompletePayload(value);
  const hash = crypto
    .createHash("sha256")
    .update(Buffer.from(canonical, "utf-8"))
    .digest("hex");
  return { hash, version: WT_COMPLETE_HASH_VERSION };
}

export type { CanonicalValue };

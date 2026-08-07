import crypto from "node:crypto";
import { Ajv } from "ajv";
import type { AnySchema, ValidateFunction } from "ajv";

/**
 * Validatore degli `ignoreDetails` contro il `detailsSchema` della ignore reason.
 *
 * Setup esplicito (§5.6.7):
 * - **draft-07**, come i seed;
 * - **`strict: false`**: i seed portano keyword applicative non standard (`x-ui`,
 *   `seed.ts:224`) che sono suggerimenti di presentazione per il form, non regole
 *   di validazione; in strict mode Ajv le rifiuterebbe;
 * - **cache per hash dello schema**: la compilazione è costosa e non deve mai
 *   avvenire dentro la transazione di apply.
 */

const ajv = new Ajv({ strict: false, allErrors: true });

/** Cache dei validator compilati, per hash dello schema. */
const validators = new Map<string, ValidateFunction>();

export type IgnoreDetailsCheck =
  | { readonly kind: "VALID" }
  | { readonly kind: "INVALID"; readonly detail: string }
  /** Lo schema salvato non compila: è un errore di configurazione, non del draft. */
  | { readonly kind: "SCHEMA_INVALID"; readonly detail: string };

function schemaKey(schema: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(schema)).digest("hex");
}

/**
 * Compila (o riusa) il validator di uno schema.
 *
 * Va invocata **fuori** dalla transazione di apply: una compilazione dentro la
 * transazione ne allungherebbe la durata e, se fallisse, la farebbe abortire.
 *
 * @param schema - `IgnoreReason.detailsSchema` come persistito
 * @returns Il validator compilato, oppure il motivo per cui lo schema non compila
 */
export function compileIgnoreDetailsValidator(
  schema: unknown,
): { readonly kind: "OK"; readonly validate: ValidateFunction } | { readonly kind: "SCHEMA_INVALID"; readonly detail: string } {
  const key = schemaKey(schema);
  const cached = validators.get(key);
  if (cached !== undefined) return { kind: "OK", validate: cached };
  try {
    const validate = ajv.compile(schema as AnySchema);
    validators.set(key, validate);
    return { kind: "OK", validate };
  } catch (error: unknown) {
    return { kind: "SCHEMA_INVALID", detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Verifica i dettagli dichiarati contro lo schema della ignore reason.
 *
 * @param schema - `detailsSchema` della reason; `null`/`undefined` = nessun vincolo
 * @param details - Dettagli dichiarati dal draft
 * @returns L'esito della verifica
 */
export function checkIgnoreDetails(schema: unknown, details: unknown): IgnoreDetailsCheck {
  if (schema === null || schema === undefined) return { kind: "VALID" };
  const compiled = compileIgnoreDetailsValidator(schema);
  if (compiled.kind === "SCHEMA_INVALID") return compiled;
  if (compiled.validate(details ?? {})) return { kind: "VALID" };
  const detail = (compiled.validate.errors ?? [])
    .map((issue) => `${issue.instancePath === "" ? "/" : issue.instancePath} ${issue.message ?? "invalid"}`)
    .join("; ");
  return { kind: "INVALID", detail };
}

/** Svuota la cache: usata solo dai test per isolare i casi. */
export function resetIgnoreDetailsValidatorCache(): void {
  validators.clear();
}

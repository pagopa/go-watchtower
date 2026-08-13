import { Value } from "@sinclair/typebox/value";

import { AnalysisDraftV1Schema } from "./analysis-draft-schema.js";
import type { AnalysisDraftV1 } from "./analysis-draft-schema.js";

export type ParsedAnalysisDraft =
  /** Nessun draft nel callback: per un KNOWN_CASE è `MISSING_DRAFT`. */
  | { readonly kind: "MISSING" }
  | { readonly kind: "INVALID"; readonly detail: string }
  | { readonly kind: "OK"; readonly draft: AnalysisDraftV1 };

/**
 * Valida semanticamente il draft ricevuto sul transport leniente.
 *
 * La route accetta `Unknown` per non produrre mai un 400 Fastify sul draft: la
 * conformità si verifica qui, dove un draft malformato diventa un `BLOCKED`
 * diagnosticabile invece di una tempesta di redelivery.
 *
 * @param value - Il valore grezzo arrivato nel callback
 * @returns Assenza, motivo di non conformità, o il draft tipizzato
 */
export function parseAnalysisDraft(value: unknown): ParsedAnalysisDraft {
  if (value === undefined || value === null) return { kind: "MISSING" };
  if (Value.Check(AnalysisDraftV1Schema, value)) {
    return { kind: "OK", draft: value };
  }
  const first = [...Value.Errors(AnalysisDraftV1Schema, value)][0];
  const detail = first === undefined ? "draft non conforme allo schema" : `${first.path} ${first.message}`;
  return { kind: "INVALID", detail };
}

import assert from "node:assert/strict";
import test from "node:test";
import { CompleteExecutionRequestSchema } from "../../src/routes/automatic-runbook-executions/schemas.js";
import type { CompleteExecutionRequest } from "../../src/routes/automatic-runbook-executions/schemas.js";
import type { CompletionRequest } from "../../src/services/automation/execution.service.js";

/**
 * Drift guard fra il contratto della rotta `complete` e il payload del service.
 *
 * Il body della rotta viene passato **intero** al service, senza ricopiarlo
 * campo per campo. La copia manuale ha già fatto sparire due volte un campo
 * dichiarato — `analysisDraft` e `failedStepId` — e in entrambi i casi né i
 * tipi né i test del service se ne sono accorti: un campo opzionale che non
 * arriva è indistinguibile da un campo non inviato.
 *
 * Qui l'invariante è dichiarata a due livelli: assegnabilità (compile time) e
 * insieme delle chiavi (runtime), così una divergenza fallisce con un messaggio
 * che dice *quale* campo, invece di un errore di assegnazione generico altrove.
 */

// Compile time: se lo schema aggiunge un campo che `CompletionRequest` non
// prevede, questa riga non compila e con essa la rotta.
type SchemaIsAssignableToService = CompleteExecutionRequest extends CompletionRequest ? true : never;
const _assignable: SchemaIsAssignableToService = true;

/**
 * Chiavi accettate dal service. Vive qui e non nel service perché un tipo
 * TypeScript non esiste a runtime: è l'unico modo di confrontare i due insiemi
 * con un messaggio d'errore utile.
 */
const SERVICE_REQUEST_KEYS: ReadonlySet<keyof CompletionRequest> = new Set([
  "attemptId",
  "outcome",
  "bytesScanned",
  "recordsScanned",
  "recordsMatched",
  "queryCount",
  "runbookKey",
  "runbookVersion",
  "runbookDigest",
  "engineExecutionId",
  "failedStepId",
  "errorCode",
  "errorMessage",
  "analysisPayload",
  "analysisDraft",
  "resultSummary",
  "tracking",
]);

test("ogni campo accettato dalla rotta complete è consumato dal service", () => {
  assert.ok(_assignable, "guard di assegnabilità valutata");
  const schemaKeys = Object.keys(CompleteExecutionRequestSchema.properties);
  const missing = schemaKeys.filter((key) => !SERVICE_REQUEST_KEYS.has(key as keyof CompletionRequest));
  assert.deepEqual(missing, [], `campi dichiarati dallo schema e non consumati dal service: ${missing.join(", ")}`);
});

test("il service non dichiara campi che la rotta non può inviare", () => {
  const schemaKeys = new Set(Object.keys(CompleteExecutionRequestSchema.properties));
  const orphans = [...SERVICE_REQUEST_KEYS].filter((key) => !schemaKeys.has(key));
  assert.deepEqual(orphans, [], `campi attesi dal service e non accettati dallo schema: ${orphans.join(", ")}`);
});

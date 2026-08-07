/**
 * Esporta deterministicamente gli artefatti di handoff WT → GA
 * (EVO-WATCHINTEG-CONTRACT-03 §3.2). Export ripetuti sullo stesso commit
 * producono byte identici.
 *
 * Output: contracts/runbook-automation/v1/
 *   ├── watchtower-openapi.json                       (route/schema runtime WT)
 *   ├── automatic-alarm-analysis-command-v1.schema.json (JSON Schema SQS)
 *   ├── analysis-draft-v1.schema.json                  (JSON Schema draft analisi)
 *   ├── watchtower-contract-manifest.json             (manifest + sha256)
 *   └── fixtures/
 *       ├── sqs-command.valid.json
 *       ├── sqs-command.invalid-version.json
 *       ├── start-responses.json
 *       └── lifecycle-control-responses.json
 *
 * Uso: tsx src/scripts/export-contract-artifacts.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";


// Env fittizio per il boot dell'app (nessun secret reale; solo per leggere lo Swagger).
process.env["JWT_SECRET"] ??= "contract-export-dummy-secret";
process.env["GOOGLE_CLIENT_ID"] ??= "contract-export-dummy";
process.env["GOOGLE_CLIENT_SECRET"] ??= "contract-export-dummy";
process.env["NODE_ENV"] ??= "production";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/backend/src/scripts → repo root
const repoRoot = path.resolve(here, "../../../..");
const outDir = path.join(repoRoot, "contracts", "runbook-automation", "v1");
const fixturesDir = path.join(outDir, "fixtures");

/** Ordina ricorsivamente le chiavi degli oggetti (array preservati) per determinismo. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysDeep(record[key]);
    }
    return sorted;
  }
  return value;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function main(): Promise<void> {
  const { buildApp } = await import("../app.js");
  const { AutomaticAlarmAnalysisCommandV1Schema } = await import(
    "../services/automation/sqs-command.js"
  );

  const app = await buildApp();
  await app.ready();
  const openapi = sortKeysDeep(app.swagger());
  await app.close();

  // 1. OpenAPI runtime WT (deterministico).
  const openapiPath = path.join(outDir, "watchtower-openapi.json");
  writeJson(openapiPath, openapi);

  // 2. JSON Schema del comando SQS (additionalProperties:false dove applicabile).
  const sqsSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    ...(sortKeysDeep(AutomaticAlarmAnalysisCommandV1Schema) as Record<string, unknown>),
  };
  const sqsSchemaPath = path.join(outDir, "automatic-alarm-analysis-command-v1.schema.json");
  writeJson(sqsSchemaPath, sqsSchema);

  // 2b. JSON Schema semantico del draft di analisi (§5.4). Il trasporto resta
  //     leniente: questo schema è applicato nel materializzatore e genera il
  //     tipo worker via json2ts.
  const { AnalysisDraftV1Schema } = await import("../services/automation/analysis-draft-schema.js");
  const draftSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "AnalysisDraftV1",
    ...(sortKeysDeep(AnalysisDraftV1Schema) as Record<string, unknown>),
  };
  writeJson(path.join(outDir, "analysis-draft-v1.schema.json"), draftSchema);

  // 3. Fixtures.
  const validCommand = {
    schemaVersion: "1.0.0",
    executionId: "0192c000-0000-7000-8000-000000000001",
    alarmEvent: {
      id: "0192c000-0000-7000-8000-0000000000aa",
      productId: "0192c000-0000-7000-8000-0000000000bb",
      environmentId: "0192c000-0000-7000-8000-0000000000cc",
      alarmId: "0192c000-0000-7000-8000-0000000000dd",
      alarmName: "pn-core-5xx",
      firedAt: "2026-06-22T10:00:00.000Z",
      awsAccountId: "170533023216",
      awsRegion: "eu-south-1",
    },
    runbook: {
      key: "pn-core-runbook",
      version: "1.0.0",
      definitionDigest: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      catalogRevision: "sha256-catalog",
      workerRevision: "build-1",
    },
    trigger: { kind: "SLACK_INGESTOR" },
  };
  writeJson(path.join(fixturesDir, "sqs-command.valid.json"), validCommand);
  writeJson(path.join(fixturesDir, "sqs-command.invalid-version.json"), {
    ...validCommand,
    schemaVersion: "2.0.0",
  });

  // start: union discriminata (happy + ALREADY_RUNNING + ALREADY_TERMINAL + CANCEL_REQUESTED).
  writeJson(path.join(fixturesDir, "start-responses.json"), {
    START: {
      disposition: "START",
      attemptId: "0192c000-0000-7000-8000-0000000000e1",
      workerDeadlineAt: "2026-06-22T10:12:00.000Z",
    },
    ALREADY_STARTED: {
      disposition: "ALREADY_STARTED",
      attemptId: "0192c000-0000-7000-8000-0000000000e1",
      workerDeadlineAt: "2026-06-22T10:12:00.000Z",
    },
    ALREADY_RUNNING: {
      disposition: "ALREADY_RUNNING",
      workerDeadlineAt: "2026-06-22T10:12:00.000Z",
    },
    CANCEL_REQUESTED: {
      disposition: "CANCEL_REQUESTED",
      cancelRequestId: "0192c000-0000-7000-8000-0000000000c1",
    },
    ALREADY_TERMINAL: { disposition: "ALREADY_TERMINAL", status: "SUCCEEDED" },
  });

  // control responses: stale callback + idempotency mismatch + cancel conflicts.
  writeJson(path.join(fixturesDir, "lifecycle-control-responses.json"), {
    progress_staleAttempt: { cancelRequested: false, staleAttempt: true },
    complete_staleAttempt: { status: "RUNNING", outcome: null, staleAttempt: true },
    complete_alreadyTerminal: { status: "SUCCEEDED", outcome: "KNOWN_CASE", alreadyTerminal: true },
    complete_idempotencyMismatch_409: { conflict: "IDEMPOTENCY_PAYLOAD_MISMATCH", status: "SUCCEEDED" },
    complete_cancellationRequested_409: { conflict: "CANCELLATION_REQUESTED" },
    cancelAck_requestMismatch_409: { conflict: "CANCELLATION_REQUEST_MISMATCH" },
    cancelAck_notRequested_409: { conflict: "CANCELLATION_NOT_REQUESTED" },
    cancel_cannotCancelTerminal_409: { conflict: "CANNOT_CANCEL_TERMINAL", status: "SUCCEEDED" },
  });

  // 4. Manifest con sha256 (path relativi a outDir). Il commit SHA dell'owner è
  //    registrato separatamente dal consumer nel proprio lock file (§3.1).
  const artifactFiles = [
    "watchtower-openapi.json",
    "automatic-alarm-analysis-command-v1.schema.json",
    "analysis-draft-v1.schema.json",
    "fixtures/sqs-command.valid.json",
    "fixtures/sqs-command.invalid-version.json",
    "fixtures/start-responses.json",
    "fixtures/lifecycle-control-responses.json",
  ];
  const manifest = {
    schemaVersion: 1,
    contractVersion: "1.0.0",
    ownerRepository: "go-watchtower",
    artifacts: artifactFiles.map((rel) => ({
      logicalName: rel.replace(/\.json$/, "").replace(/\//g, ":"),
      path: rel,
      sha256: sha256(path.join(outDir, rel)),
    })),
  };
  writeJson(path.join(outDir, "watchtower-contract-manifest.json"), manifest);

   
  console.log(`Contract artifacts written to ${path.relative(repoRoot, outDir)}`);
  for (const a of manifest.artifacts) {
     
    console.log(`  ${a.sha256.slice(0, 12)}  ${a.path}`);
  }
}

main().catch((err: unknown) => {
  console.error("Contract export failed:", err);
  process.exit(1);
});

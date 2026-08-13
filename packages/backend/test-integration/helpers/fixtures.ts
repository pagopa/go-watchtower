import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "@go-watchtower/database";
import { RUNBOOK_AUTOMATION_SERVICE_ID } from "@go-watchtower/shared";
import {
  startExecution,
  createManualExecution,
  type CompletionActors,
} from "../../src/services/automation/execution.service.js";
import type { KnownCaseAnalysisDraft } from "../../src/services/automation/analysis-draft-schema.js";
import { registerCapabilityCatalogFor } from "./capability-catalog.js";

/**
 * Fixture condivise delle suite di integrazione automation.
 *
 * Ogni suite lavora su un prodotto usa-e-getta con nomi randomici: le execution
 * sono append-only e il censimento è per prodotto, quindi isolare il prodotto
 * isola tutto il resto senza cleanup fra un test e l'altro.
 */

export interface AutomationWorld {
  readonly productId: string;
  readonly environmentId: string;
  readonly alarmId: string;
  readonly alarmName: string;
  readonly serviceUserId: string;
  readonly humanUserId: string;
  readonly actors: CompletionActors;
}

/** L'apply richiede `analysisDate` successivo al primo allarme oltre tolleranza. */
const EVENT_FIRED_AT = new Date("2026-06-22T10:00:00.000Z");

export function suffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Crea prodotto, ambiente, allarme e capability catalog per una suite.
 *
 * @param prefix - Prefisso del nome prodotto, per riconoscere la suite a DB
 */
export async function createWorld(prefix: string): Promise<AutomationWorld> {
  const service = await prisma.user.findUnique({ where: { serviceId: RUNBOOK_AUTOMATION_SERVICE_ID } });
  assert.ok(service, "service principal must be seeded (run prisma db seed)");
  const human = await prisma.user.findFirst({ where: { principalType: "HUMAN" } });
  assert.ok(human, "a human user must exist (seed admin)");

  const id = suffix();
  const product = await prisma.product.create({ data: { name: `${prefix}-${id}` } });
  const environment = await prisma.environment.create({ data: { name: `env-${id}`, productId: product.id } });
  const alarmName = `alarm-${id}`;
  const alarm = await prisma.alarm.create({ data: { name: alarmName, productId: product.id } });
  await registerCapabilityCatalogFor([alarmName]);

  return {
    productId: product.id,
    environmentId: environment.id,
    alarmId: alarm.id,
    alarmName,
    serviceUserId: service.id,
    humanUserId: human.id,
    actors: {
      lifecycleActorUserId: service.id,
      lifecycleActorType: "SERVICE",
      lifecycleAccess: { kind: "SERVICE" },
      analysisOperatorUserId: service.id,
    },
  };
}

export async function createEvent(world: AutomationWorld): Promise<string> {
  const event = await prisma.alarmEvent.create({
    data: {
      name: `evt-${suffix()}`,
      firedAt: EVENT_FIRED_AT,
      awsRegion: "eu-south-1",
      awsAccountId: "170533023216",
      productId: world.productId,
      environmentId: world.environmentId,
      alarmId: world.alarmId,
    },
  });
  return event.id;
}

export interface RunningExecution {
  readonly executionId: string;
  readonly attemptId: string;
  readonly alarmEventId: string;
}

/** Lancia un'esecuzione manuale su un evento nuovo e la porta a RUNNING. */
export async function startFreshExecution(world: AutomationWorld, alarmEventId?: string): Promise<RunningExecution> {
  const eventId = alarmEventId ?? (await createEvent(world));
  const created = await createManualExecution(eventId, "WATCHTOWER_API", {
    userId: world.humanUserId,
    label: "itest",
  });
  assert.equal(created.kind, "OK", `createManualExecution: ${JSON.stringify(created)}`);
  if (created.kind !== "OK") throw new Error("unreachable");
  const executionId = created.execution.id;

  const started = await startExecution(executionId, delivery(`m-${suffix()}`));
  assert.ok("response" in started, "startExecution must not be forbidden for the service principal");
  assert.ok("attemptId" in started.response, `unexpected disposition: ${started.response.disposition}`);
  return { executionId, attemptId: started.response.attemptId, alarmEventId: eventId };
}

export function delivery(sqsMessageId: string, approximateReceiveCount = 1): {
  sqsMessageId: string;
  approximateReceiveCount: number;
  workerDeadlineAt: string;
} {
  return {
    sqsMessageId,
    approximateReceiveCount,
    // Deadline nel futuro rispetto a *ora*, non all'evento: una lease già scaduta
    // renderebbe ogni start un takeover e falserebbe i test di concorrenza.
    workerDeadlineAt: new Date(Date.now() + 12 * 60 * 1000).toISOString(),
  };
}

/** Esecuzione creata ma non ancora avviata, per i test sulla race di start. */
export async function createPendingExecution(world: AutomationWorld): Promise<string> {
  const eventId = await createEvent(world);
  const created = await createManualExecution(eventId, "WATCHTOWER_API", {
    userId: world.humanUserId,
    label: "itest",
  });
  assert.equal(created.kind, "OK", `createManualExecution: ${JSON.stringify(created)}`);
  if (created.kind !== "OK") throw new Error("unreachable");
  return created.execution.id;
}

export async function setDefaultMode(mode: "SHADOW" | "APPLY_KNOWN" | "APPLY_ALL"): Promise<void> {
  await prisma.systemSetting.update({ where: { key: "automation.defaultMode" }, data: { value: mode } });
}

/** Draft KNOWN_CASE minimo e valido: nessun riferimento dichiarato, quindi nulla da risolvere. */
export function knownDraft(overrides: Partial<KnownCaseAnalysisDraft> = {}): KnownCaseAnalysisDraft {
  return {
    schemaVersion: 1,
    kind: "KNOWN_CASE",
    conclusionNotes: "Analisi automatica di integrazione.",
    proposedStatus: "COMPLETED",
    analysisType: "ANALYZABLE",
    resources: [],
    downstreams: [],
    finalActions: [],
    links: [],
    ...overrides,
  };
}

export function unknownDraft(): { schemaVersion: 1; kind: "UNKNOWN_CASE_CONTEXT"; resources: []; downstreams: []; finalActions: []; links: [] } {
  return { schemaVersion: 1, kind: "UNKNOWN_CASE_CONTEXT", resources: [], downstreams: [], finalActions: [], links: [] };
}

// ─── censimento ───────────────────────────────────────────────────────────────

export async function createResource(world: AutomationWorld, name: string, typeName: string): Promise<void> {
  const type = await prisma.resourceType.upsert({
    where: { name: typeName },
    create: { name: typeName },
    update: {},
  });
  await prisma.resource.create({ data: { name, typeId: type.id, productId: world.productId } });
}

export async function createDownstream(world: AutomationWorld, name: string): Promise<void> {
  await prisma.downstream.create({ data: { name, productId: world.productId } });
}

export async function createFinalAction(world: AutomationWorld, name: string): Promise<void> {
  await prisma.finalAction.create({ data: { name, productId: world.productId } });
}

export async function createIgnoreReason(code: string, detailsSchema?: unknown): Promise<void> {
  await prisma.ignoreReason.upsert({
    where: { code },
    create: {
      code,
      label: code,
      ...(detailsSchema === undefined ? {} : { detailsSchema: detailsSchema as never }),
    },
    update: {},
  });
}

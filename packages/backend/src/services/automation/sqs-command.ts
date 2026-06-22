import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  AUTOMATION_TRIGGER_KIND_VALUES,
  AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION as SHARED_COMMAND_VERSION,
} from "@go-watchtower/shared";
import "./typebox-formats.js";

/**
 * Comando di esecuzione SQS — wire contract WT → GA (CONTRACT-03 §5, OPUS-03 §7.1).
 * WT produce; GA valida e consuma. `additionalProperties: false` ovunque applicabile.
 * Il comando cloud NON contiene profili AWS, secret, token o log.
 */

const UuidString = Type.String({ format: "uuid" });

export const AlarmEventSnapshotSchema = Type.Object(
  {
    id: UuidString,
    productId: UuidString,
    environmentId: UuidString,
    alarmId: UuidString,
    alarmName: Type.String({ minLength: 1 }),
    firedAt: Type.String({ format: "date-time" }),
    awsAccountId: Type.String({ minLength: 1 }),
    awsRegion: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const CommandTriggerSchema = Type.Object(
  {
    kind: Type.Union(AUTOMATION_TRIGGER_KIND_VALUES.map((k) => Type.Literal(k))),
    actorId: Type.Optional(Type.String({ minLength: 1 })),
    parentExecutionId: Type.Optional(UuidString),
  },
  { additionalProperties: false },
);

export const AutomaticAlarmAnalysisCommandV1Schema = Type.Object(
  {
    schemaVersion: Type.Literal("1.0.0"),
    executionId: UuidString,
    alarmEvent: AlarmEventSnapshotSchema,
    trigger: CommandTriggerSchema,
  },
  {
    $id: "AutomaticAlarmAnalysisCommandV1",
    additionalProperties: false,
  },
);

export type AutomaticAlarmAnalysisCommandV1 = Static<
  typeof AutomaticAlarmAnalysisCommandV1Schema
>;

export const AUTOMATIC_ALARM_ANALYSIS_COMMAND_VERSION = SHARED_COMMAND_VERSION;

/**
 * Parametri di invio SQS FIFO derivati dal comando (OPUS-03 §9.8 invariante FIFO):
 * - MessageGroupId esattamente `alarm-event:<alarmEvent.id>` (ordering per occorrenza);
 * - MessageDeduplicationId = executionId.
 */
export interface SqsSendParams {
  readonly messageBody: string;
  readonly messageGroupId: string;
  readonly messageDeduplicationId: string;
}

export function messageGroupIdForAlarmEvent(alarmEventId: string): string {
  return `alarm-event:${alarmEventId}`;
}

export class InvalidCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommandError";
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Costruisce i parametri di invio validando il comando e l'event id PRIMA del send
 * (test §17: "event id assente/invalido viene rifiutato prima del send").
 */
export function buildSqsSendParams(
  command: AutomaticAlarmAnalysisCommandV1,
): SqsSendParams {
  if (!Value.Check(AutomaticAlarmAnalysisCommandV1Schema, command)) {
    const first = [...Value.Errors(AutomaticAlarmAnalysisCommandV1Schema, command)][0];
    throw new InvalidCommandError(
      `Invalid AutomaticAlarmAnalysisCommandV1: ${first?.message ?? "schema mismatch"} at ${first?.path ?? "<root>"}`,
    );
  }
  if (!UUID_RE.test(command.alarmEvent.id)) {
    throw new InvalidCommandError("alarmEvent.id must be a valid UUID before send");
  }
  if (!UUID_RE.test(command.executionId)) {
    throw new InvalidCommandError("executionId must be a valid UUID before send");
  }
  return {
    messageBody: JSON.stringify(command),
    messageGroupId: messageGroupIdForAlarmEvent(command.alarmEvent.id),
    messageDeduplicationId: command.executionId,
  };
}

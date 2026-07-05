import {
  buildSqsSendParams,
  InvalidCommandError,
  type AutomaticAlarmAnalysisCommandV1,
} from "./sqs-command.js";
import type { RegionalQueueRegistry } from "./queue-registry.js";
import type { CapabilityCatalogProvider } from "./capability-catalog.js";

/**
 * Orchestrazione del dispatch WT → SQS (OPUS-03 §9.8). Pura rispetto all'AWS SDK:
 * la send concreta è dietro la port {@link SqsSender}, implementata da un adapter
 * `@aws-sdk/client-sqs`.
 * WT costruisce il client SQS nella regione della queue e non esegue fallback
 * cross-region.
 */

export interface SqsSendInput {
  readonly queueUrl: string;
  readonly region: string;
  readonly messageBody: string;
  readonly messageGroupId: string;
  readonly messageDeduplicationId: string;
}

export interface SqsSender {
  /** Invia un messaggio FIFO. Throws su errore di invio (gestito come transient). */
  send(input: SqsSendInput): Promise<{ messageId: string }>;
}

export type DispatchResult =
  | { readonly kind: "QUEUED"; readonly sqsMessageId: string; readonly messageRetentionSeconds: number; readonly revision: string }
  // Lascia l'execution PENDING_DISPATCH (errore transitorio SSM o invio fallito): il reconciler ritenta.
  | { readonly kind: "TRANSIENT"; readonly reason: string }
  // Chiude FAILED/CONFIGURATION_ERROR/REGION_NOT_ONBOARDED.
  | { readonly kind: "REGION_NOT_ONBOARDED"; readonly region: string }
  // Chiude FAILED/CONFIGURATION_ERROR/QUEUE_REGISTRY_INVALID.
  | { readonly kind: "QUEUE_REGISTRY_INVALID"; readonly reason: string }
  // Comando invalido prima del send (errore di programmazione/contract): non accodare.
  | { readonly kind: "INVALID_COMMAND"; readonly reason: string }
  | { readonly kind: "CATALOG_UNAVAILABLE"; readonly reason: string }
  | { readonly kind: "CAPABILITY_WITHDRAWN"; readonly key: string };

/**
 * Risolve la queue per `command.alarmEvent.awsRegion`, costruisce i parametri FIFO
 * e invia. Il `markQueued` (CAS PENDING_DISPATCH → QUEUED) è responsabilità del
 * chiamante e usa `messageRetentionSeconds` per il queue-delivery budget.
 */
export async function dispatchExecution(
  command: AutomaticAlarmAnalysisCommandV1,
  registry: RegionalQueueRegistry,
  sender: SqsSender,
  catalog?: CapabilityCatalogProvider,
): Promise<DispatchResult> {
  if (catalog) {
    const capability = await catalog.resolve(command);
    if (capability.kind !== "OK") return capability;
  }
  const region = command.alarmEvent.awsRegion;
  const resolution = await registry.resolveQueue(region);

  switch (resolution.kind) {
    case "TRANSIENT":
      return { kind: "TRANSIENT", reason: resolution.reason };
    case "REGION_NOT_ONBOARDED":
      return { kind: "REGION_NOT_ONBOARDED", region: resolution.region };
    case "QUEUE_REGISTRY_INVALID":
      return { kind: "QUEUE_REGISTRY_INVALID", reason: resolution.reason };
    case "OK":
      break;
    default: {
      const exhaustive: never = resolution;
      throw new Error(`Unhandled resolution ${JSON.stringify(exhaustive)}`);
    }
  }

  let params;
  try {
    params = buildSqsSendParams(command);
  } catch (err) {
    if (err instanceof InvalidCommandError) {
      return { kind: "INVALID_COMMAND", reason: err.message };
    }
    throw err;
  }

  try {
    const { messageId } = await sender.send({
      queueUrl: resolution.queue.queueUrl,
      region: resolution.region,
      messageBody: params.messageBody,
      messageGroupId: params.messageGroupId,
      messageDeduplicationId: params.messageDeduplicationId,
    });
    return {
      kind: "QUEUED",
      sqsMessageId: messageId,
      messageRetentionSeconds: resolution.queue.messageRetentionSeconds,
      revision: resolution.revision,
    };
  } catch (err) {
    // Fallimento di invio (coda esistente ma irraggiungibile) non blocca la create:
    // resta PENDING_DISPATCH (M2), il reconciler ritenta.
    return { kind: "TRANSIENT", reason: err instanceof Error ? err.message : String(err) };
  }
}

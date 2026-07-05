import crypto from "node:crypto";
import {
  AutomationDispatchKinds,
  AutomationExecutionStatuses,
  AutomationLifecycleBudgets,
  AutomationTriggerKinds,
  SlackAutomationDecisions,
  type AutomationMode,
  type SlackAutomationDecision,
  type SlackAutomationDecisionMetadata,
} from "@go-watchtower/shared";
import {
  Prisma,
  type AlarmEvent,
  type AutomaticRunbookExecution,
} from "../generated/prisma/client.js";
import { prisma } from "./client.js";

type AlarmEventCreateData = Omit<
  Prisma.AlarmEventUncheckedCreateInput,
  | "id"
  | "automationDecision"
  | "automationDecisionMetadata"
  | "automationDecidedAt"
> & { id?: string };

export interface SlackExecutionCapabilityInput {
  key: string;
  version: string;
  definitionDigest: string;
  catalogRevision: string;
  workerRevision: string;
}

export interface SlackExecutionCreateInput {
  id?: string;
  capability: SlackExecutionCapabilityInput;
  appliedMode: AutomationMode;
  command: Prisma.InputJsonValue;
  deadlineAt?: Date;
}

export interface CreateSlackAlarmEventDecisionInput {
  eventData: AlarmEventCreateData;
  decision: SlackAutomationDecision;
  decisionMetadata: SlackAutomationDecisionMetadata;
  execution?: SlackExecutionCreateInput;
  now?: Date;
}

export interface CreateSlackAlarmEventDecisionResult {
  event: AlarmEvent;
  execution: AutomaticRunbookExecution | null;
  executionId: string | null;
}

/**
 * Persiste AlarmEvent, receipt decisionale ed eventuale outbox execution nella
 * stessa transazione. Il caller calcola la decisione da snapshot control/catalog;
 * questo helper rende impossibile una decisione EXECUTION_CREATED senza execution
 * o una execution associata a una decisione negativa.
 */
export async function createSlackAlarmEventDecision(
  input: CreateSlackAlarmEventDecisionInput,
  transaction?: Prisma.TransactionClient,
): Promise<CreateSlackAlarmEventDecisionResult> {
  const hasExecution = input.execution !== undefined;
  if (
    (input.decision === SlackAutomationDecisions.EXECUTION_CREATED) !==
    hasExecution
  ) {
    throw new Error(
      "EXECUTION_CREATED and execution payload must be provided together",
    );
  }
  const now = input.now ?? new Date();
  const eventId = input.eventData.id ?? crypto.randomUUID();
  const executionId =
    input.execution?.id ?? (hasExecution ? crypto.randomUUID() : null);
  const metadata: SlackAutomationDecisionMetadata = executionId
    ? { ...input.decisionMetadata, executionId }
    : input.decisionMetadata;

  const execute = async (
    tx: Prisma.TransactionClient,
  ): Promise<CreateSlackAlarmEventDecisionResult> => {
    const event = await tx.alarmEvent.create({
      data: {
        ...input.eventData,
        id: eventId,
        automationDecision: input.decision,
        automationDecisionMetadata:
          metadata as unknown as Prisma.InputJsonValue,
        automationDecidedAt: now,
      },
    });
    if (!input.execution || !executionId)
      return { event, execution: null, executionId: null };
    if (!event.alarmId)
      throw new Error(
        "Cannot create an automatic execution for an unlinked AlarmEvent",
      );
    const execution = await tx.automaticRunbookExecution.create({
      data: {
        id: executionId,
        requestKey: `SLACK:${event.id}`,
        alarmEventId: event.id,
        productId: event.productId,
        environmentId: event.environmentId,
        alarmId: event.alarmId,
        status: AutomationExecutionStatuses.PENDING_DISPATCH,
        triggerKind: AutomationTriggerKinds.SLACK_INGESTOR,
        dispatchKind: AutomationDispatchKinds.SQS,
        appliedMode: input.execution.appliedMode,
        requestedRunbookKey: input.execution.capability.key,
        requestedRunbookVersion: input.execution.capability.version,
        requestedRunbookDigest: input.execution.capability.definitionDigest,
        catalogRevision: input.execution.capability.catalogRevision,
        workerRevision: input.execution.capability.workerRevision,
        inputSnapshot: input.execution.command,
        deadlineAt:
          input.execution.deadlineAt ??
          new Date(
            now.getTime() + AutomationLifecycleBudgets.DISPATCH_BUDGET_MS,
          ),
      },
    });
    return { event, execution, executionId };
  };

  return transaction ? execute(transaction) : prisma.$transaction(execute);
}

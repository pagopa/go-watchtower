import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  prisma,
  SystemComponent,
  type AutomaticRunbookExecution,
  type AutomaticRunbookAttempt,
} from "@go-watchtower/database";
import { RUNBOOK_AUTOMATION_SERVICE_ID } from "@go-watchtower/shared";
import { requirePermission } from "../../lib/require-permission.js";
import { requireHumanPrincipal, requireServiceOrCliHuman } from "../../lib/require-principal.js";
import { HttpError } from "../../utils/http-errors.js";
import {
  ExecutionIdParamsSchema,
  IdempotencyKeyHeaderSchema,
  StartExecutionRequestSchema,
  StartExecutionResponseSchema,
  ProgressExecutionRequestSchema,
  ProgressExecutionResponseSchema,
  CompleteExecutionRequestSchema,
  CompleteExecutionResponseSchema,
  ExecutionDetailDtoSchema,
  ControlConflictResponseSchema,
  FailExecutionRequestSchema,
  FailExecutionResponseSchema,
  AcknowledgeCancellationRequestSchema,
  AcknowledgeCancellationResponseSchema,
  CancelExecutionRequestSchema,
  CancelExecutionResponseSchema,
  CreateExecutionRequestSchema,
  CreateCliExecutionRequestSchema,
  CliExecutionCommandResponseSchema,
  ReviewExecutionRequestSchema,
  ExecutionDtoSchema,
  ExecutionListQuerySchema,
  ExecutionListResponseSchema,
  AttemptListResponseSchema,
  AttemptsQuerySchema,
  ExecutionStatsResponseSchema,
  ErrorResponseSchema,
  type ExecutionIdParams,
  type StartExecutionRequest,
  type ProgressExecutionRequest,
  type CompleteExecutionRequest,
  type FailExecutionRequest,
  type AcknowledgeCancellationRequest,
  type CancelExecutionRequest,
  type CreateExecutionRequest,
  type CreateCliExecutionRequest,
  type ReviewExecutionRequest,
  type ExecutionListQuery,
  type AttemptsQuery,
} from "./schemas.js";
import {
  startExecution,
  progressExecution,
  completeExecution,
  failExecution,
  acknowledgeCancellation,
  requestCancel,
  reviewExecution,
  createManualExecution,
  createCliExecution,
  previewCliExecutionCommand,
  retryExecution,
  type Actor,
  type CompletionActors,
  type LifecycleAccess,
  type LifecycleActor,
} from "../../services/automation/execution.service.js";

const RESOURCE = SystemComponent.AUTOMATIC_RUNBOOK_EXECUTION;
const BEARER = [{ bearerAuth: [] }];

function iso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

function bigToString(v: bigint | null): string | null {
  return v === null ? null : v.toString();
}

function toExecutionDto(e: AutomaticRunbookExecution) {
  return {
    id: e.id,
    parentExecutionId: e.parentExecutionId,
    alarmEventId: e.alarmEventId,
    analysisId: e.analysisId,
    productId: e.productId,
    environmentId: e.environmentId,
    alarmId: e.alarmId,
    status: e.status,
    outcome: e.outcome,
    reviewStatus: e.reviewStatus,
    triggerKind: e.triggerKind,
    dispatchKind: e.dispatchKind,
    appliedMode: e.appliedMode,
    runbookKey: e.runbookKey,
    runbookVersion: e.runbookVersion,
    errorCode: e.errorCode,
    errorMessage: e.errorMessage,
    queryCount: e.queryCount,
    bytesScanned: bigToString(e.bytesScanned),
    recordsScanned: bigToString(e.recordsScanned),
    recordsMatched: bigToString(e.recordsMatched),
    totalWorkerAttempts: e.totalWorkerAttempts,
    deliveryCycle: e.deliveryCycle,
    cancelRequestedAt: iso(e.cancelRequestedAt),
    cancelReason: e.cancelReason,
    cancelledAt: iso(e.cancelledAt),
    cancellationFinalizedBy: e.cancellationFinalizedBy,
    queuedAt: iso(e.queuedAt),
    startedAt: iso(e.startedAt),
    deadlineAt: e.deadlineAt.toISOString(),
    completedAt: iso(e.completedAt),
    durationMs: e.durationMs,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function toExecutionDetailDto(e: AutomaticRunbookExecution) {
  return {
    ...toExecutionDto(e),
    inputSnapshot: e.inputSnapshot ?? null,
    resultSummary: e.resultSummary ?? null,
    analysisPayload: e.analysisPayload ?? null,
  };
}

function toAttemptDto(a: AutomaticRunbookAttempt) {
  return {
    id: a.id,
    executionId: a.executionId,
    attemptNumber: a.attemptNumber,
    deliveryCycle: a.deliveryCycle,
    cycleReceiveCount: a.cycleReceiveCount,
    sqsMessageId: a.sqsMessageId,
    status: a.status,
    phase: a.phase,
    heartbeatSequence: a.heartbeatSequence,
    retryDisposition: a.retryDisposition,
    errorCode: a.errorCode,
    errorMessage: a.errorMessage,
    startedAt: a.startedAt.toISOString(),
    lastHeartbeatAt: iso(a.lastHeartbeatAt),
    finishedAt: iso(a.finishedAt),
    durationMs: a.durationMs,
  };
}

function actorOf(request: { user: { userId: string; name?: string; email?: string } }): Actor {
  const u = request.user;
  return { userId: u.userId, label: u.name ? `${u.name} (${u.email})` : (u.email ?? u.userId) };
}

type LifecycleRequest = {
  user: { userId: string; principalType?: "HUMAN" | "SERVICE"; authMethod?: "CLI_PAT" | "SERVICE_LOGIN" | "HUMAN_LOGIN" };
  lifecycleAccess?: LifecycleAccess;
};

function lifecycleAccessOf(request: LifecycleRequest): LifecycleAccess {
  if (request.lifecycleAccess === undefined) throw new Error("Lifecycle authorization context missing");
  return request.lifecycleAccess;
}

function lifecycleActorOf(request: LifecycleRequest): LifecycleActor {
  const actorType = request.user.authMethod === "CLI_PAT" || request.user.principalType === "HUMAN" ? "HUMAN" : "SERVICE";
  return {
    lifecycleActorUserId: request.user.userId,
    lifecycleActorType: actorType,
    lifecycleAuthMethod:
      request.user.authMethod ?? (actorType === "HUMAN" ? "HUMAN_LOGIN" : "SERVICE_LOGIN"),
    lifecycleAccess: lifecycleAccessOf(request),
  };
}

async function completionActorsOf(request: LifecycleRequest): Promise<CompletionActors> {
  const lifecycleActor = lifecycleActorOf(request);
  if (request.user.authMethod === "CLI_PAT") {
    const service = await prisma.user.findUnique({
      where: { serviceId: RUNBOOK_AUTOMATION_SERVICE_ID },
      select: { id: true, isActive: true },
    });
    if (!service?.isActive) {
      throw new Error("Runbook automation service principal is not active");
    }
    return {
      analysisOperatorUserId: service.id,
      ...lifecycleActor,
    };
  }
  if (lifecycleActor.lifecycleAccess.kind !== "SERVICE") {
    throw new Error("Completion actor resolution expected a service lifecycle actor");
  }
  return {
    analysisOperatorUserId: request.user.userId,
    ...lifecycleActor,
  };
}

export async function automaticRunbookExecutionRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();
  const lifecycleGuard = requireServiceOrCliHuman(RUNBOOK_AUTOMATION_SERVICE_ID);

  // ─── human read ──────────────────────────────────────────────────────────

  app.get<{ Querystring: ExecutionListQuery }>(
    "/automatic-runbook-executions",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "List automatic runbook executions (paginated, filterable)",
        security: BEARER,
        querystring: ExecutionListQuerySchema,
        response: { 200: ExecutionListResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const q = request.query;
      const page = q.page ?? 1;
      const limit = q.limit ?? 50;
      const where = {
        ...(q.status ? { status: q.status } : {}),
        ...(q.outcome ? { outcome: q.outcome } : {}),
        ...(q.reviewStatus ? { reviewStatus: q.reviewStatus } : {}),
        ...(q.triggerKind ? { triggerKind: q.triggerKind } : {}),
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.environmentId ? { environmentId: q.environmentId } : {}),
        ...(q.alarmId ? { alarmId: q.alarmId } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.automaticRunbookExecution.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.automaticRunbookExecution.count({ where }),
      ]);
      reply.send({ data: rows.map(toExecutionDto), total, page, totalPages: Math.ceil(total / limit) });
    },
  );

  app.get<{ Params: ExecutionIdParams }>(
    "/automatic-runbook-executions/:id",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Get an execution by id",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        response: { 200: ExecutionDetailDtoSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const analysisSelect = {
        id: true,
        productId: true,
        analysisType: true,
        status: true,
        analysisDate: true,
      } as const;
      const row = await prisma.automaticRunbookExecution.findUnique({
        where: { id: request.params.id },
        include: {
          alarmEvent: {
            select: {
              name: true,
              firedAt: true,
              awsAccountId: true,
              awsRegion: true,
              product: { select: { name: true } },
              environment: { select: { name: true } },
              alarm: { select: { name: true } },
              analysis: { select: analysisSelect },
            },
          },
          // Chi ha avviato (umano o service principal); null per gli avvii di sistema.
          triggeredBy: { select: { name: true, email: true, principalType: true, serviceId: true } },
          // Analisi applicata al completamento (può differire da quella dell'occorrenza).
          analysis: { select: analysisSelect },
        },
      });
      if (!row) return HttpError.notFound(reply, "Execution");
      // Analisi di partenza: quella applicata dall'esecuzione se già nota,
      // altrimenti quella attualmente collegata all'occorrenza.
      const linked = row.analysis ?? row.alarmEvent.analysis;
      const context = {
        alarmName: row.alarmEvent.alarm?.name ?? null,
        alarmEventName: row.alarmEvent.name,
        firedAt: row.alarmEvent.firedAt.toISOString(),
        productName: row.alarmEvent.product.name,
        environmentName: row.alarmEvent.environment.name,
        awsAccountId: row.alarmEvent.awsAccountId,
        awsRegion: row.alarmEvent.awsRegion,
        triggeredBy: {
          userId: row.triggeredByUserId,
          label: row.triggeredByLabel,
          name: row.triggeredBy?.name ?? null,
          email: row.triggeredBy?.email ?? null,
          principalType: row.triggeredBy?.principalType ?? null,
          serviceId: row.triggeredBy?.serviceId ?? null,
        },
        linkedAnalysis: linked
          ? {
              id: linked.id,
              productId: linked.productId,
              analysisType: linked.analysisType,
              status: linked.status,
              analysisDate: linked.analysisDate.toISOString(),
            }
          : null,
      };
      reply.send({ ...toExecutionDetailDto(row), context });
    },
  );

  app.get<{ Params: ExecutionIdParams; Querystring: AttemptsQuery }>(
    "/automatic-runbook-executions/:id/attempts",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "List attempts of an execution (newest first)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        querystring: AttemptsQuerySchema,
        response: { 200: AttemptListResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 50;
      const where = { executionId: request.params.id };
      const [rows, total] = await Promise.all([
        prisma.automaticRunbookAttempt.findMany({
          where,
          orderBy: { attemptNumber: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.automaticRunbookAttempt.count({ where }),
      ]);
      reply.send({ data: rows.map(toAttemptDto), total, page, totalPages: Math.ceil(total / limit) });
    },
  );

  app.get(
    "/automatic-runbook-executions/stats",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "KPI dashboard counters",
        security: BEARER,
        response: { 200: ExecutionStatsResponseSchema, 403: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const [byStatus, byOutcome, pendingReview, inDlq, defaultSetting, overrideSetting] = await Promise.all([
        prisma.automaticRunbookExecution.groupBy({ by: ["status"], _count: true }),
        prisma.automaticRunbookExecution.groupBy({ by: ["outcome"], _count: true }),
        prisma.automaticRunbookExecution.count({ where: { reviewStatus: "PENDING" } }),
        prisma.automaticRunbookExecution.count({ where: { status: "RETRY_PENDING" } }),
        prisma.systemSetting.findUnique({ where: { key: "automation.defaultMode" } }),
        prisma.systemSetting.findUnique({ where: { key: "automation.modeOverride" } }),
      ]);
      const statusMap: Record<string, number> = {};
      for (const s of byStatus) statusMap[s.status] = s._count;
      const outcomeMap: Record<string, number> = {};
      for (const o of byOutcome) if (o.outcome) outcomeMap[o.outcome] = o._count;
      const isMode = (v: unknown): v is "SHADOW" | "APPLY_KNOWN" | "APPLY_ALL" =>
        v === "SHADOW" || v === "APPLY_KNOWN" || v === "APPLY_ALL";
      const defaultMode = isMode(defaultSetting?.value) ? defaultSetting.value : "SHADOW";
      const modeOverride = isMode(overrideSetting?.value) ? overrideSetting.value : null;
      reply.send({ byStatus: statusMap, byOutcome: outcomeMap, pendingReview, inDlq, defaultMode, modeOverride });
    },
  );

  // ─── human write ─────────────────────────────────────────────────────────

  app.post<{ Body: CreateExecutionRequest }>(
    "/automatic-runbook-executions",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Create a manual execution (Flow 2) — enqueued by the dispatcher",
        security: BEARER,
        body: CreateExecutionRequestSchema,
        response: { 201: ExecutionDtoSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 422: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await createManualExecution(request.body.alarmEventId, "WATCHTOWER_UI", actorOf(request), request.body.mode);
      if (result.kind === "ALARM_EVENT_NOT_FOUND") return HttpError.notFound(reply, "Alarm event");
      if (result.kind === "ALARM_EVENT_NOT_LINKABLE") {
        reply.status(422).send({ error: result.reason });
        return;
      }
      reply.status(201).send(toExecutionDto(result.execution));
    },
  );

  app.post<{ Body: CreateCliExecutionRequest }>(
    "/automatic-runbook-executions/cli",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Create a CLI execution and return the canonical command",
        security: BEARER,
        body: CreateCliExecutionRequestSchema,
        response: { 201: CliExecutionCommandResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 422: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await createCliExecution(request.body.alarmEventId, actorOf(request), request.body.mode);
      if (result.kind === "ALARM_EVENT_NOT_FOUND") return HttpError.notFound(reply, "Alarm event");
      if (result.kind === "ALARM_EVENT_NOT_LINKABLE") {
        reply.status(422).send({ error: result.reason });
        return;
      }
      reply.status(201).send({ execution: toExecutionDto(result.execution), command: result.command });
    },
  );

  app.post<{ Body: CreateCliExecutionRequest }>(
    "/automatic-runbook-executions/cli/preview",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "read")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Preview a CLI execution command without persisting an execution",
        security: BEARER,
        body: CreateCliExecutionRequestSchema,
        response: { 200: CliExecutionCommandResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 422: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await previewCliExecutionCommand(request.body.alarmEventId, actorOf(request));
      if (result.kind === "ALARM_EVENT_NOT_FOUND") return HttpError.notFound(reply, "Alarm event");
      if (result.kind === "ALARM_EVENT_NOT_LINKABLE") {
        reply.status(422).send({ error: result.reason });
        return;
      }
      reply.send({ command: result.command, dryRun: true });
    },
  );

  app.post<{ Params: ExecutionIdParams }>(
    "/automatic-runbook-executions/:id/retry",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Re-launch as a child execution (parentExecutionId)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        response: { 201: ExecutionDtoSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 409: ControlConflictResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await retryExecution(request.params.id, actorOf(request));
      if (result.kind === "NOT_FOUND") return HttpError.notFound(reply, "Execution");
      if (result.kind === "CANNOT_RETRY_CLI") {
        reply.status(409).send({ conflict: "CANNOT_RETRY_CLI" });
        return;
      }
      reply.status(201).send(toExecutionDto(result.execution));
    },
  );

  app.post<{ Params: ExecutionIdParams; Body: ReviewExecutionRequest }>(
    "/automatic-runbook-executions/:id/review",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Confirm or reject the automatic result",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        body: ReviewExecutionRequestSchema,
        response: { 200: ExecutionDtoSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await reviewExecution(request.params.id, request.body.decision, actorOf(request));
      if (result.kind === "NOT_FOUND") return HttpError.notFound(reply, "Execution");
      const row = await prisma.automaticRunbookExecution.findUnique({ where: { id: request.params.id } });
      if (!row) return HttpError.notFound(reply, "Execution");
      reply.send(toExecutionDto(row));
    },
  );

  app.post<{ Params: ExecutionIdParams; Body: CancelExecutionRequest }>(
    "/automatic-runbook-executions/:id/cancel",
    {
      onRequest: [app.authenticate, requireHumanPrincipal(), requirePermission(RESOURCE, "write")],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Request cooperative cancellation (HUMAN)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        body: CancelExecutionRequestSchema,
        response: {
          200: CancelExecutionResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ControlConflictResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await requestCancel(request.params.id, request.body.reason, actorOf(request));
      switch (result.kind) {
        case "NOT_FOUND":
          return HttpError.notFound(reply, "Execution");
        case "CANNOT_CANCEL_TERMINAL":
          reply.status(409).send({ conflict: "CANNOT_CANCEL_TERMINAL", status: result.status });
          return;
        case "ALREADY":
        case "OK":
          reply.send({ status: result.status, cancelRequestId: result.cancelRequestId });
          return;
        default: {
          const exhaustive: never = result;
          throw new Error(`Unhandled cancel result ${JSON.stringify(exhaustive)}`);
        }
      }
    },
  );

  // ─── service worker callbacks (lifecycle) ──────────────────────────────────

  app.post<{ Params: ExecutionIdParams; Body: StartExecutionRequest }>(
    "/automatic-runbook-executions/:id/start",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, lifecycleGuard],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Worker: acquire the lease (lease arbitration under lock)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        headers: IdempotencyKeyHeaderSchema,
        body: StartExecutionRequestSchema,
        response: { 200: StartExecutionResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await startExecution(request.params.id, request.body, lifecycleAccessOf(request));
      if ("notFound" in result) return HttpError.notFound(reply, "Execution");
      if ("response" in result) {
        reply.send(result.response);
        return;
      }
      reply.status(403).send({ error: result.error });
    },
  );

  app.patch<{ Params: ExecutionIdParams; Body: ProgressExecutionRequest }>(
    "/automatic-runbook-executions/:id/progress",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, lifecycleGuard],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Worker: heartbeat/phase fenced by attemptId; response carries cancelRequested",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        headers: IdempotencyKeyHeaderSchema,
        body: ProgressExecutionRequestSchema,
        response: { 200: ProgressExecutionResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await progressExecution(request.params.id, request.body, lifecycleAccessOf(request));
      if ("notFound" in result) return HttpError.notFound(reply, "Execution");
      if ("response" in result) {
        reply.send(result.response);
        return;
      }
      reply.status(403).send({ error: result.error });
    },
  );

  app.post<{ Params: ExecutionIdParams; Body: CompleteExecutionRequest }>(
    "/automatic-runbook-executions/:id/complete",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, lifecycleGuard],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Worker: terminate with a runbook outcome (no resultHash; status derived from outcome)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        headers: IdempotencyKeyHeaderSchema,
        body: CompleteExecutionRequestSchema,
        response: {
          200: CompleteExecutionResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ControlConflictResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      let actors: CompletionActors;
      try {
        actors = await completionActorsOf(request);
      } catch (error) {
        reply.status(500).send({ error: error instanceof Error ? error.message : "Completion actor resolution failed" });
        return;
      }
      const result = await completeExecution(request.params.id, actors, {
        attemptId: body.attemptId,
        outcome: body.outcome,
        ...(body.bytesScanned !== undefined ? { bytesScanned: body.bytesScanned } : {}),
        ...(body.recordsScanned !== undefined ? { recordsScanned: body.recordsScanned } : {}),
        ...(body.recordsMatched !== undefined ? { recordsMatched: body.recordsMatched } : {}),
        ...(body.queryCount !== undefined ? { queryCount: body.queryCount } : {}),
        ...(body.runbookKey !== undefined ? { runbookKey: body.runbookKey } : {}),
        ...(body.runbookVersion !== undefined ? { runbookVersion: body.runbookVersion } : {}),
        ...(body.engineExecutionId !== undefined ? { engineExecutionId: body.engineExecutionId } : {}),
        ...(body.errorCode !== undefined ? { errorCode: body.errorCode } : {}),
        ...(body.errorMessage !== undefined ? { errorMessage: body.errorMessage } : {}),
        ...(body.analysisPayload !== undefined ? { analysisPayload: body.analysisPayload } : {}),
        ...(body.resultSummary !== undefined ? { resultSummary: body.resultSummary } : {}),
        ...(body.tracking !== undefined ? { tracking: body.tracking } : {}),
      });
      switch (result.kind) {
        case "NOT_FOUND":
          return HttpError.notFound(reply, "Execution");
        case "FORBIDDEN":
          reply.status(403).send({ error: result.error });
          return;
        case "IDEMPOTENCY_PAYLOAD_MISMATCH":
          reply.status(409).send({ conflict: "IDEMPOTENCY_PAYLOAD_MISMATCH", status: result.status });
          return;
        case "CANCELLATION_REQUESTED":
          reply.status(409).send({ conflict: "CANCELLATION_REQUESTED" });
          return;
        case "STALE_ATTEMPT":
          reply.send({ status: result.status, outcome: null, staleAttempt: true });
          return;
        case "ALREADY_TERMINAL":
          reply.send({ status: result.status, outcome: body.outcome, alreadyTerminal: true });
          return;
        case "OK":
          reply.send({ status: result.status, outcome: result.outcome, appliedMode: result.appliedMode, analysisId: result.analysisId });
          return;
        default: {
          const exhaustive: never = result;
          throw new Error(`Unhandled complete result ${JSON.stringify(exhaustive)}`);
        }
      }
    },
  );

  app.post<{ Params: ExecutionIdParams; Body: FailExecutionRequest }>(
    "/automatic-runbook-executions/:id/fail",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, lifecycleGuard],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Worker: permanent allowlisted failure (retryable=false)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        headers: IdempotencyKeyHeaderSchema,
        body: FailExecutionRequestSchema,
        response: {
          200: FailExecutionResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ControlConflictResponseSchema,
          422: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const result = await failExecution(
        request.params.id,
        lifecycleActorOf(request),
        {
          scope: body.scope,
          ...(body.scope === "ACTIVE_ATTEMPT" ? { attemptId: body.attemptId } : {}),
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
          failedPhase: body.failedPhase,
        },
      );
      switch (result.kind) {
        case "NOT_FOUND":
          return HttpError.notFound(reply, "Execution");
        case "FORBIDDEN":
          reply.status(403).send({ error: result.error });
          return;
        case "CONFLICT_TERMINAL":
          reply.status(409).send({ conflict: "IDEMPOTENCY_PAYLOAD_MISMATCH", status: result.status });
          return;
        case "CANCELLATION_REQUESTED":
          reply.status(409).send({ conflict: "CANCELLATION_REQUESTED" });
          return;
        case "REJECT_NOT_RUNNABLE":
          reply.status(422).send({ error: "fail not allowed from current state" });
          return;
        case "STALE_ATTEMPT":
          // staleAttempt da ACTIVE_ATTEMPT avviene solo con execution RUNNING.
          reply.send({ status: "RUNNING", staleAttempt: true });
          return;
        case "ALREADY_TERMINAL":
          reply.send({ status: result.status, alreadyTerminal: true });
          return;
        case "OK":
          reply.send({ status: result.status });
          return;
        default: {
          const exhaustive: never = result;
          throw new Error(`Unhandled fail result ${JSON.stringify(exhaustive)}`);
        }
      }
    },
  );

  app.post<{ Params: ExecutionIdParams; Body: AcknowledgeCancellationRequest }>(
    "/automatic-runbook-executions/:id/cancel/ack",
    {
      config: { allowCliPat: true },
      onRequest: [app.authenticate, lifecycleGuard],
      schema: {
        tags: ["Automatic Runbook Executions"],
        summary: "Worker: acknowledge cooperative cancellation (owner only)",
        security: BEARER,
        params: ExecutionIdParamsSchema,
        headers: IdempotencyKeyHeaderSchema,
        body: AcknowledgeCancellationRequestSchema,
        response: {
          200: AcknowledgeCancellationResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ControlConflictResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const result = await acknowledgeCancellation(
        request.params.id,
        lifecycleActorOf(request),
        {
          cancelRequestId: body.cancelRequestId,
          attemptId: body.attemptId,
          ...(body.partialTelemetry !== undefined ? { partialTelemetry: body.partialTelemetry } : {}),
        },
      );
      switch (result.kind) {
        case "NOT_FOUND":
          return HttpError.notFound(reply, "Execution");
        case "FORBIDDEN":
          reply.status(403).send({ error: result.error });
          return;
        case "MISMATCH":
          reply.status(409).send({ conflict: "CANCELLATION_REQUEST_MISMATCH" });
          return;
        case "NOT_REQUESTED":
          reply.status(409).send({ conflict: "CANCELLATION_NOT_REQUESTED" });
          return;
        case "ALREADY_TERMINAL":
          reply.send({ status: result.status, alreadyTerminal: true });
          return;
        case "OK":
          reply.send({ status: result.status });
          return;
        default: {
          const exhaustive: never = result;
          throw new Error(`Unhandled cancel-ack result ${JSON.stringify(exhaustive)}`);
        }
      }
    },
  );
}

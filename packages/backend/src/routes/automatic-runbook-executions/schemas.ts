import { Type, type Static } from "@sinclair/typebox";
import {
  AUTOMATION_EXECUTION_STATUS_VALUES,
  AUTOMATION_EXECUTION_OUTCOME_VALUES,
  AUTOMATION_TRIGGER_KIND_VALUES,
  AUTOMATION_REVIEW_STATUS_VALUES,
  AUTOMATION_MODE_VALUES,
  AUTOMATION_ATTEMPT_STATUS_VALUES,
  AUTOMATION_FAIL_ERROR_CODE_VALUES,
  AUTOMATION_FAIL_ERROR_CATEGORY_VALUES,
} from "@go-watchtower/shared";
import { ErrorResponseSchema } from "../../schemas/common.js";

export { ErrorResponseSchema };

// Wire contract delle API automation (EVO-WATCHTINTEG-OPUS-03 §9.7 / CONTRACT-03 §4).
// È la fonte dell'OpenAPI deterministico esportato per GA.

const enumUnion = <T extends string>(values: readonly T[]) =>
  Type.Union(values.map((v) => Type.Literal(v)));

/** Metrica grande sul wire = stringa decimale non negativa (BigInt → string, §9.4). */
const DecimalString = Type.String({ pattern: "^(0|[1-9][0-9]*)$" });

// ─── Common ─────────────────────────────────────────────────────────────────

export const ExecutionIdParamsSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
});
export type ExecutionIdParams = Static<typeof ExecutionIdParamsSchema>;

/** Le cinque callback worker richiedono Idempotency-Key (§9.7). */
export const IdempotencyKeyHeaderSchema = Type.Object({
  "idempotency-key": Type.String({ minLength: 1, maxLength: 255 }),
});

// ─── start ─────────────────────────────────────────────────────────────────

export const StartExecutionRequestSchema = Type.Object(
  {
    sqsMessageId: Type.String({ minLength: 1 }),
    approximateReceiveCount: Type.Integer({ minimum: 1 }),
    workerDeadlineAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type StartExecutionRequest = Static<typeof StartExecutionRequestSchema>;

const TerminalStatusSchema = Type.Union([
  Type.Literal("SUCCEEDED"),
  Type.Literal("SKIPPED"),
  Type.Literal("FAILED"),
  Type.Literal("CANCELLED"),
]);

export const StartExecutionResponseSchema = Type.Union(
  [
    Type.Object({
      disposition: Type.Literal("START"),
      attemptId: Type.String({ format: "uuid" }),
      workerDeadlineAt: Type.String({ format: "date-time" }),
    }),
    Type.Object({
      disposition: Type.Literal("ALREADY_STARTED"),
      attemptId: Type.String({ format: "uuid" }),
      workerDeadlineAt: Type.String({ format: "date-time" }),
    }),
    Type.Object({
      disposition: Type.Literal("ALREADY_RUNNING"),
      workerDeadlineAt: Type.String({ format: "date-time" }),
    }),
    Type.Object({
      disposition: Type.Literal("CANCEL_REQUESTED"),
      cancelRequestId: Type.String({ format: "uuid" }),
    }),
    Type.Object({
      disposition: Type.Literal("ALREADY_TERMINAL"),
      status: TerminalStatusSchema,
    }),
  ],
  { $id: "StartExecutionResponse" },
);
export type StartExecutionResponse = Static<typeof StartExecutionResponseSchema>;

// ─── progress ────────────────────────────────────────────────────────────────

export const ProgressExecutionRequestSchema = Type.Object(
  {
    attemptId: Type.String({ format: "uuid" }),
    phase: Type.String({ minLength: 1, maxLength: 200 }),
    heartbeatSequence: Type.Integer({ minimum: 1 }),
    sqsMessageId: Type.String({ minLength: 1 }),
    approximateReceiveCount: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type ProgressExecutionRequest = Static<typeof ProgressExecutionRequestSchema>;

export const ProgressExecutionResponseSchema = Type.Object({
  cancelRequested: Type.Boolean(),
  staleAttempt: Type.Optional(Type.Boolean()),
  cancelRequestId: Type.Optional(Type.String({ format: "uuid" })),
  cancelRequestedAt: Type.Optional(Type.String({ format: "date-time" })),
});
export type ProgressExecutionResponse = Static<typeof ProgressExecutionResponseSchema>;

// ─── complete ─────────────────────────────────────────────────────────────────
// CompleteExecutionRequestV1: NESSUN resultHash. Metriche come stringhe decimali.

export const TrackingEntrySchema = Type.Object(
  {
    identifierType: Type.Union([
      Type.Literal("TRACE_ID"),
      Type.Literal("REQUEST_ID"),
      Type.Literal("CORRELATION_ID"),
      Type.Literal("FALLBACK_UUID"),
      Type.Literal("AUTOMATION_EXECUTION_ID"),
    ]),
    identifierValue: Type.String({ minLength: 1, maxLength: 512 }),
    errorCode: Type.Optional(Type.String({ maxLength: 200 })),
    errorDetail: Type.Optional(Type.String({ maxLength: 2048 })),
    timestamp: Type.String({ format: "date-time" }),
    sourceStep: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { additionalProperties: false },
);

export const CompleteExecutionRequestSchema = Type.Object(
  {
    attemptId: Type.String({ format: "uuid" }),
    outcome: enumUnion(AUTOMATION_EXECUTION_OUTCOME_VALUES),
    runbookKey: Type.Optional(Type.String({ maxLength: 200 })),
    runbookVersion: Type.Optional(Type.String({ maxLength: 100 })),
    engineExecutionId: Type.Optional(Type.String({ maxLength: 200 })),
    queryCount: Type.Optional(Type.Integer({ minimum: 0 })),
    bytesScanned: Type.Optional(DecimalString),
    recordsScanned: Type.Optional(DecimalString),
    recordsMatched: Type.Optional(DecimalString),
    failedStepId: Type.Optional(Type.String({ maxLength: 200 })),
    errorCode: Type.Optional(Type.String({ maxLength: 200 })),
    errorMessage: Type.Optional(Type.String({ maxLength: 2048 })),
    tracking: Type.Optional(Type.Array(TrackingEntrySchema, { maxItems: 64 })),
    // Analisi automatica strutturata (autoritativa nel ramo 3, summary nei rami 1/2).
    analysisPayload: Type.Optional(Type.Unknown()),
    resultSummary: Type.Optional(Type.Unknown()),
  },
  { additionalProperties: false },
);
export type CompleteExecutionRequest = Static<typeof CompleteExecutionRequestSchema>;

export const CompleteExecutionResponseSchema = Type.Object({
  status: enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES),
  outcome: Type.Union([enumUnion(AUTOMATION_EXECUTION_OUTCOME_VALUES), Type.Null()]),
  alreadyTerminal: Type.Optional(Type.Boolean()),
  staleAttempt: Type.Optional(Type.Boolean()),
  appliedMode: Type.Optional(enumUnion(AUTOMATION_MODE_VALUES)),
  analysisId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export type CompleteExecutionResponse = Static<typeof CompleteExecutionResponseSchema>;

/** 409 di conflitto idempotenza/cancellazione (control response tipizzata, non transport error). */
export const ControlConflictResponseSchema = Type.Object({
  conflict: Type.Union([
    Type.Literal("IDEMPOTENCY_PAYLOAD_MISMATCH"),
    Type.Literal("CANCELLATION_REQUESTED"),
    Type.Literal("CANNOT_CANCEL_TERMINAL"),
    Type.Literal("CANCELLATION_REQUEST_MISMATCH"),
    Type.Literal("CANCELLATION_NOT_REQUESTED"),
  ]),
  status: Type.Optional(enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES)),
});
export type ControlConflictResponse = Static<typeof ControlConflictResponseSchema>;

// ─── fail ─────────────────────────────────────────────────────────────────────

const FailDetailsSchema = {
  errorCode: enumUnion(AUTOMATION_FAIL_ERROR_CODE_VALUES),
  errorCategory: enumUnion(AUTOMATION_FAIL_ERROR_CATEGORY_VALUES),
  failedPhase: Type.String({ minLength: 1, maxLength: 200 }),
  retryable: Type.Literal(false),
  errorMessage: Type.String({ maxLength: 2048 }),
};

export const FailExecutionRequestSchema = Type.Union([
  Type.Object(
    {
      ...FailDetailsSchema,
      scope: Type.Literal("PRE_START"),
      sqsMessageId: Type.String({ minLength: 1 }),
      approximateReceiveCount: Type.Integer({ minimum: 1 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...FailDetailsSchema,
      scope: Type.Literal("ACTIVE_ATTEMPT"),
      attemptId: Type.String({ format: "uuid" }),
    },
    { additionalProperties: false },
  ),
]);
export type FailExecutionRequest = Static<typeof FailExecutionRequestSchema>;

export const FailExecutionResponseSchema = Type.Object({
  status: enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES),
  alreadyTerminal: Type.Optional(Type.Boolean()),
  staleAttempt: Type.Optional(Type.Boolean()),
});
export type FailExecutionResponse = Static<typeof FailExecutionResponseSchema>;

// ─── cancel/ack (service) ─────────────────────────────────────────────────────

export const CancellationTelemetrySchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    queryCount: Type.Optional(Type.Integer({ minimum: 0 })),
    bytesScanned: Type.Optional(DecimalString),
    recordsScanned: Type.Optional(DecimalString),
    queryStops: Type.Optional(
      Type.Array(
        Type.Object(
          {
            service: Type.Union([Type.Literal("LOGS"), Type.Literal("ATHENA")]),
            queryId: Type.String({ maxLength: 256 }),
            stopState: Type.Union([
              Type.Literal("STOPPED"),
              Type.Literal("ALREADY_DONE"),
              Type.Literal("FAILED"),
              Type.Literal("ID_UNKNOWN"),
            ]),
          },
          { additionalProperties: false },
        ),
        { maxItems: 64 },
      ),
    ),
    durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const AcknowledgeCancellationRequestSchema = Type.Object(
  {
    cancelRequestId: Type.String({ format: "uuid" }),
    attemptId: Type.String({ format: "uuid" }),
    sqsMessageId: Type.String({ minLength: 1 }),
    approximateReceiveCount: Type.Integer({ minimum: 1 }),
    lastPhase: Type.Optional(Type.String({ maxLength: 200 })),
    partialTelemetry: Type.Optional(CancellationTelemetrySchema),
    cleanupWarnings: Type.Optional(Type.Array(Type.String({ maxLength: 100 }), { maxItems: 32 })),
  },
  { additionalProperties: false },
);
export type AcknowledgeCancellationRequest = Static<typeof AcknowledgeCancellationRequestSchema>;

export const AcknowledgeCancellationResponseSchema = Type.Object({
  status: enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES),
  alreadyTerminal: Type.Optional(Type.Boolean()),
});
export type AcknowledgeCancellationResponse = Static<typeof AcknowledgeCancellationResponseSchema>;

// ─── human: cancel / create / retry / review ──────────────────────────────────

export const CancelExecutionRequestSchema = Type.Object(
  { reason: Type.Optional(Type.String({ maxLength: 500 })) },
  { additionalProperties: false },
);
export type CancelExecutionRequest = Static<typeof CancelExecutionRequestSchema>;

export const CancelExecutionResponseSchema = Type.Object({
  status: enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES),
  cancelRequestId: Type.Union([Type.String(), Type.Null()]),
});

export const CreateExecutionRequestSchema = Type.Object(
  { alarmEventId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
export type CreateExecutionRequest = Static<typeof CreateExecutionRequestSchema>;

export const ReviewExecutionRequestSchema = Type.Object(
  {
    decision: Type.Union([Type.Literal("CONFIRMED"), Type.Literal("REJECTED")]),
    note: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);
export type ReviewExecutionRequest = Static<typeof ReviewExecutionRequestSchema>;

// ─── read DTOs ────────────────────────────────────────────────────────────────

export const ExecutionDtoSchema = Type.Object({
  id: Type.String(),
  parentExecutionId: Type.Union([Type.String(), Type.Null()]),
  alarmEventId: Type.String(),
  analysisId: Type.Union([Type.String(), Type.Null()]),
  productId: Type.String(),
  environmentId: Type.String(),
  alarmId: Type.Union([Type.String(), Type.Null()]),
  status: enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES),
  outcome: Type.Union([enumUnion(AUTOMATION_EXECUTION_OUTCOME_VALUES), Type.Null()]),
  reviewStatus: enumUnion(AUTOMATION_REVIEW_STATUS_VALUES),
  triggerKind: enumUnion(AUTOMATION_TRIGGER_KIND_VALUES),
  appliedMode: enumUnion(AUTOMATION_MODE_VALUES),
  runbookKey: Type.Union([Type.String(), Type.Null()]),
  runbookVersion: Type.Union([Type.String(), Type.Null()]),
  errorCode: Type.Union([Type.String(), Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  queryCount: Type.Union([Type.Integer(), Type.Null()]),
  bytesScanned: Type.Union([DecimalString, Type.Null()]),
  recordsScanned: Type.Union([DecimalString, Type.Null()]),
  recordsMatched: Type.Union([DecimalString, Type.Null()]),
  totalWorkerAttempts: Type.Integer(),
  deliveryCycle: Type.Integer(),
  cancelRequestedAt: Type.Union([Type.String(), Type.Null()]),
  cancelReason: Type.Union([Type.String(), Type.Null()]),
  cancelledAt: Type.Union([Type.String(), Type.Null()]),
  cancellationFinalizedBy: Type.Union([Type.String(), Type.Null()]),
  queuedAt: Type.Union([Type.String(), Type.Null()]),
  startedAt: Type.Union([Type.String(), Type.Null()]),
  deadlineAt: Type.String(),
  completedAt: Type.Union([Type.String(), Type.Null()]),
  durationMs: Type.Union([Type.Integer(), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});

// Dettaglio esecuzione: include i JSON versionati (snapshot/risultato/analisi)
// non presenti nel DTO di lista per non appesantire la paginazione (§15.1).
export const ExecutionContextSchema = Type.Object({
  alarmName: Type.Union([Type.String(), Type.Null()]),
  alarmEventName: Type.String(),
  firedAt: Type.String(),
  productName: Type.String(),
  environmentName: Type.String(),
  awsAccountId: Type.String(),
  awsRegion: Type.String(),
})

export const ExecutionDetailDtoSchema = Type.Composite([
  ExecutionDtoSchema,
  Type.Object({
    inputSnapshot: Type.Unknown(),
    resultSummary: Type.Unknown(),
    analysisPayload: Type.Unknown(),
    context: ExecutionContextSchema,
  }),
])

export const AttemptDtoSchema = Type.Object({
  id: Type.String(),
  executionId: Type.String(),
  attemptNumber: Type.Integer(),
  deliveryCycle: Type.Integer(),
  cycleReceiveCount: Type.Integer(),
  sqsMessageId: Type.String(),
  status: enumUnion(AUTOMATION_ATTEMPT_STATUS_VALUES),
  phase: Type.Union([Type.String(), Type.Null()]),
  heartbeatSequence: Type.Integer(),
  retryDisposition: Type.Union([Type.String(), Type.Null()]),
  errorCode: Type.Union([Type.String(), Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  startedAt: Type.String(),
  lastHeartbeatAt: Type.Union([Type.String(), Type.Null()]),
  finishedAt: Type.Union([Type.String(), Type.Null()]),
  durationMs: Type.Union([Type.Integer(), Type.Null()]),
});

export const ExecutionListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  status: Type.Optional(enumUnion(AUTOMATION_EXECUTION_STATUS_VALUES)),
  outcome: Type.Optional(enumUnion(AUTOMATION_EXECUTION_OUTCOME_VALUES)),
  reviewStatus: Type.Optional(enumUnion(AUTOMATION_REVIEW_STATUS_VALUES)),
  triggerKind: Type.Optional(enumUnion(AUTOMATION_TRIGGER_KIND_VALUES)),
  productId: Type.Optional(Type.String({ format: "uuid" })),
  environmentId: Type.Optional(Type.String({ format: "uuid" })),
  alarmId: Type.Optional(Type.String({ format: "uuid" })),
});
export type ExecutionListQuery = Static<typeof ExecutionListQuerySchema>;

export const ExecutionListResponseSchema = Type.Object({
  data: Type.Array(ExecutionDtoSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  totalPages: Type.Integer(),
});

export const AttemptListResponseSchema = Type.Object({
  data: Type.Array(AttemptDtoSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  totalPages: Type.Integer(),
});

export const AttemptsQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
});
export type AttemptsQuery = Static<typeof AttemptsQuerySchema>;

export const ExecutionStatsResponseSchema = Type.Object({
  byStatus: Type.Record(Type.String(), Type.Integer()),
  byOutcome: Type.Record(Type.String(), Type.Integer()),
  pendingReview: Type.Integer(),
  inDlq: Type.Integer(),
});

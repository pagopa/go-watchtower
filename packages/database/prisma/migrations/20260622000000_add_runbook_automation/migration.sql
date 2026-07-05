-- ═══════════════════════════════════════════════════════════
-- RUNBOOK AUTOMATION ⇄ WATCHTOWER (EVO-WATCHTINTEG-OPUS-03 §9.4)
-- Source of truth: DB, state machine, AuthN/AuthZ, lifecycle deadline/lease.
--
-- Greenfield migration: le tabelle automatic_runbook_* non esistono ancora,
-- quindi deadline_at è NOT NULL fin dall'inizio (nessun backfill richiesto).
-- La strategia di backfill descritta in §9.4 (deadline_at nullable → valorizza →
-- NOT NULL) si applicherebbe solo migrando una tabella execution preesistente.
-- ═══════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "PrincipalType" AS ENUM ('HUMAN', 'SERVICE');
CREATE TYPE "AnalysisOrigin" AS ENUM ('MANUAL', 'AUTOMATIC', 'HYBRID');
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('PENDING_DISPATCH', 'QUEUED', 'RUNNING', 'RETRY_PENDING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'SKIPPED', 'FAILED', 'CANCELLED');
CREATE TYPE "AutomationExecutionOutcome" AS ENUM ('KNOWN_CASE', 'UNKNOWN_CASE', 'NO_DATA', 'CAPABILITY_WITHDRAWN', 'CONFIGURATION_ERROR', 'EXECUTION_ERROR');
CREATE TYPE "SlackAutomationDecision" AS ENUM ('EXECUTION_CREATED', 'EXECUTION_POLICY_OFF', 'UNLINKED_ALARM', 'CATALOG_UNAVAILABLE', 'NO_CAPABILITY', 'SCOPE_CONFIGURATION_UNSAFE', 'SCOPE_DENIED', 'LEGACY_EVENT_NOT_EVALUATED');
CREATE TYPE "AutomationTriggerKind" AS ENUM ('SLACK_INGESTOR', 'WATCHTOWER_UI', 'WATCHTOWER_API', 'RETRY', 'WATCHTOWER_CLI');
CREATE TYPE "AutomationDispatchKind" AS ENUM ('SQS', 'CLI');
CREATE TYPE "AutomationReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "AutomationMode" AS ENUM ('SHADOW', 'APPLY_KNOWN', 'APPLY_ALL');
CREATE TYPE "AutomationAttemptStatus" AS ENUM ('RUNNING', 'COMPLETED', 'INTERRUPTED', 'FAILED', 'CANCELLED');
CREATE TYPE "AutomationRetryDisposition" AS ENUM ('COMPLETE_OUTCOME', 'CANCEL_EXECUTION', 'RETRY_MESSAGE', 'FAIL_EXECUTION');
CREATE TYPE "AutomationCancellationFinalizedBy" AS ENUM ('IMMEDIATE', 'WORKER', 'SYSTEM');
CREATE TYPE "RefreshTokenSource" AS ENUM ('HUMAN_LOGIN', 'SERVICE_LOGIN', 'CLI_PAT');

-- Nuovo valore SystemComponent (NON usato in questa migration: i permessi/seed
-- vivono in seed.ts, perché Postgres vieta l'uso di un valore enum nello stesso
-- transaction in cui viene aggiunto).
DO $$
BEGIN
  ALTER TYPE "SystemComponent" ADD VALUE 'AUTOMATIC_RUNBOOK_EXECUTION';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── User: identità tecnica tipizzata (D4/A1) ─────────────────────────────────

ALTER TABLE "users"
  ADD COLUMN "principal_type" "PrincipalType" NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "service_id" TEXT,
  ADD COLUMN "cli_token_hash" TEXT,
  ADD COLUMN "cli_token_hint" TEXT,
  ADD COLUMN "cli_token_created_at" TIMESTAMP(3),
  ADD COLUMN "cli_token_last_used_at" TIMESTAMP(3),
  ADD COLUMN "cli_token_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_service_id_key" ON "users" ("service_id");
CREATE UNIQUE INDEX "users_cli_token_hash_key" ON "users" ("cli_token_hash");
CREATE INDEX "users_cli_token_expires_at_idx" ON "users" ("cli_token_expires_at");

ALTER TABLE "users"
  ADD CONSTRAINT "users_principal_service_id_consistent" CHECK (
    (principal_type = 'SERVICE' AND service_id IS NOT NULL)
    OR (principal_type = 'HUMAN' AND service_id IS NULL)
  );

ALTER TABLE "users"
  ADD CONSTRAINT "users_cli_token_expires_at_present" CHECK (
    cli_token_hash IS NULL OR cli_token_expires_at IS NOT NULL
  );

ALTER TABLE "refresh_tokens"
  ADD COLUMN "source" "RefreshTokenSource" NOT NULL DEFAULT 'HUMAN_LOGIN',
  ADD COLUMN "cli_token_hash" TEXT;

CREATE INDEX "refresh_tokens_user_id_source_revoked_at_idx" ON "refresh_tokens" ("user_id", "source", "revoked_at");
CREATE INDEX "refresh_tokens_cli_token_hash_revoked_at_idx" ON "refresh_tokens" ("cli_token_hash", "revoked_at");

-- ── AlarmAnalysis: provenienza + puntatore lastApplied (§9.2/§9.4) ───────────

ALTER TABLE "alarm_analyses"
  ADD COLUMN "origin" "AnalysisOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "last_applied_execution_id" UUID;

-- ── Slack Ingestor control / monitoring (EVO-SLACKINGRA-CODEX-03) ───────────

ALTER TABLE "environments"
  ADD COLUMN "slack_ingestor_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "slack_parser_id" TEXT;

CREATE UNIQUE INDEX "environments_slack_channel_id_key" ON "environments" ("slack_channel_id");

-- Parser per canale: riporta la configurazione del CHANNEL_REGISTRY dello script
-- slack-ingestor (config.ts, rimosso con questa evolutiva) sugli environment già
-- presenti nel database. No-op sui DB dove i canali non esistono ancora.
UPDATE "environments" SET "slack_parser_id" = 'jsm'       WHERE "slack_channel_id" = 'C0585442Z39'; -- SEND / Produzione
UPDATE "environments" SET "slack_parser_id" = 'amazon-q'  WHERE "slack_channel_id" = 'C03JJLHL5K8'; -- SEND / UAT
UPDATE "environments" SET "slack_parser_id" = 'email-sns' WHERE "slack_channel_id" = 'C0AGKJCMYDQ'; -- SEND / Building Block
UPDATE "environments" SET "slack_parser_id" = 'email-sns' WHERE "slack_channel_id" = 'C0472QPG5D2'; -- Interop / Produzione
UPDATE "environments" SET "slack_parser_id" = 'email-sns' WHERE "slack_channel_id" = 'C06LQ7Y8B17'; -- Interop / Attestazione
UPDATE "environments" SET "slack_parser_id" = 'email-sns' WHERE "slack_channel_id" = 'C04708Y1QP5'; -- Interop / Collaudo
UPDATE "environments" SET "slack_parser_id" = 'email-sns' WHERE "slack_channel_id" = 'C09RVCSL4BS'; -- Interop / Catalog

ALTER TABLE "alarm_events"
  ADD COLUMN "automation_decision" "SlackAutomationDecision",
  ADD COLUMN "automation_decision_metadata" JSONB,
  ADD COLUMN "automation_decided_at" TIMESTAMP(3);

ALTER TABLE "alarm_events"
  ADD CONSTRAINT "alarm_events_automation_decision_complete" CHECK (
    (automation_decision IS NULL AND automation_decision_metadata IS NULL AND automation_decided_at IS NULL)
    OR (automation_decision IS NOT NULL AND automation_decision_metadata IS NOT NULL AND automation_decided_at IS NOT NULL)
  );

CREATE INDEX "alarm_events_automation_decision_created_at_idx"
  ON "alarm_events" ("automation_decision", "created_at");

ALTER TABLE "slack_channel_cursors"
  ALTER COLUMN "latest_ts" DROP NOT NULL,
  ADD COLUMN "last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "last_success_at" TIMESTAMP(3),
  ADD COLUMN "last_status" TEXT,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "last_summary" JSONB,
  ADD COLUMN "last_control_revision" INTEGER,
  ADD COLUMN "last_catalog_revision" TEXT;

CREATE TABLE "automation_capability_catalog" (
  "key" TEXT NOT NULL,
  "revision" TEXT,
  "source_published_at" TIMESTAMP(3),
  "source_version_id" TEXT,
  "source_etag" TEXT,
  "payload" JSONB,
  "last_attempt_at" TIMESTAMP(3),
  "last_verified_at" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "last_error_code" TEXT,
  "last_error" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "automation_capability_catalog_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "automation_capability_catalog_singleton_key" CHECK ("key" = 'ACTIVE'),
  CONSTRAINT "automation_capability_catalog_valid_state" CHECK (
    ("payload" IS NULL AND "revision" IS NULL AND "last_verified_at" IS NULL AND "valid_until" IS NULL)
    OR ("payload" IS NOT NULL AND "revision" IS NOT NULL AND "last_verified_at" IS NOT NULL AND "valid_until" IS NOT NULL)
  )
);

INSERT INTO "system_settings" (
  "id", "key", "value", "type", "format", "category", "label", "description", "updated_at"
) VALUES (
  '019808ec-81f0-7f57-a3d9-78ad5b80f5a1',
  'slackIngestor.control',
  '{"schemaVersion":1,"revision":1,"ingestionMode":"ENABLED","executionPolicy":"OFF","defaultRuleEffect":"DENY","rules":[]}'::jsonb,
  'JSON',
  'SLACK_INGESTOR_CONTROL',
  'SYSTEM',
  'Controllo Slack Ingestor',
  'Controlla ingestione Slack e creazione delle execution automatiche.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- ── automatic_runbook_executions ─────────────────────────────────────────────

CREATE TABLE "automatic_runbook_executions" (
  "id" UUID NOT NULL,
  "parent_execution_id" UUID,
  "request_key" TEXT,
  "alarm_event_id" UUID NOT NULL,
  "analysis_id" UUID,
  "product_id" UUID NOT NULL,
  "environment_id" UUID NOT NULL,
  "alarm_id" UUID,
  "status" "AutomationExecutionStatus" NOT NULL,
  "outcome" "AutomationExecutionOutcome",
  "review_status" "AutomationReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "reviewed_by_user_id" UUID,
  "reviewed_by_label" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "cancel_requested_by_user_id" UUID,
  "cancel_requested_by_label" TEXT,
  "cancel_request_id" UUID,
  "cancel_reason" VARCHAR(500),
  "cancel_requested_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancellation_finalized_by" "AutomationCancellationFinalizedBy",
  "trigger_kind" "AutomationTriggerKind" NOT NULL,
  "dispatch_kind" "AutomationDispatchKind" NOT NULL DEFAULT 'SQS',
  "triggered_by_user_id" UUID,
  "triggered_by_label" TEXT,
  "applied_mode" "AutomationMode" NOT NULL,
  "requested_runbook_key" TEXT NOT NULL,
  "requested_runbook_version" TEXT NOT NULL,
  "requested_runbook_digest" TEXT NOT NULL,
  "catalog_revision" TEXT NOT NULL,
  "worker_revision" TEXT NOT NULL,
  "executed_runbook_key" TEXT,
  "executed_runbook_version" TEXT,
  "executed_runbook_digest" TEXT,
  "engine_execution_id" TEXT,
  "input_snapshot" JSONB NOT NULL,
  "result_summary" JSONB,
  "analysis_payload" JSONB,
  "error_code" TEXT,
  "error_message" TEXT,
  "failed_step_id" TEXT,
  "query_count" INTEGER,
  "bytes_scanned" BIGINT,
  "records_scanned" BIGINT,
  "records_matched" BIGINT,
  "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
  "total_worker_attempts" INTEGER NOT NULL DEFAULT 0,
  "delivery_cycle" INTEGER NOT NULL DEFAULT 1,
  "cycle_receive_count" INTEGER NOT NULL DEFAULT 0,
  "sqs_message_id" TEXT,
  "queued_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "last_heartbeat_at" TIMESTAMP(3),
  "active_attempt_id" UUID,
  "worker_deadline_at" TIMESTAMP(3),
  "deadline_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "automatic_runbook_executions_pkey" PRIMARY KEY ("id")
);

-- ── automatic_runbook_attempts ───────────────────────────────────────────────

CREATE TABLE "automatic_runbook_attempts" (
  "id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "delivery_cycle" INTEGER NOT NULL,
  "cycle_receive_count" INTEGER NOT NULL,
  "sqs_message_id" TEXT NOT NULL,
  "status" "AutomationAttemptStatus" NOT NULL,
  "phase" TEXT,
  "heartbeat_sequence" INTEGER NOT NULL DEFAULT 0,
  "retry_disposition" "AutomationRetryDisposition",
  "completion_payload_hash" VARCHAR(64),
  "completion_hash_version" VARCHAR(32),
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_heartbeat_at" TIMESTAMP(3),
  "worker_deadline_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "automatic_runbook_attempts_pkey" PRIMARY KEY ("id")
);

-- ── Unique indexes ───────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "automatic_runbook_executions_request_key_key" ON "automatic_runbook_executions" ("request_key");
CREATE UNIQUE INDEX "automatic_runbook_executions_cancel_request_id_key" ON "automatic_runbook_executions" ("cancel_request_id");
CREATE UNIQUE INDEX "automatic_runbook_executions_active_attempt_id_key" ON "automatic_runbook_executions" ("active_attempt_id");

CREATE UNIQUE INDEX "automatic_runbook_attempts_execution_id_attempt_number_key" ON "automatic_runbook_attempts" ("execution_id", "attempt_number");
CREATE UNIQUE INDEX "automatic_runbook_attempts_execution_id_sqs_message_id_cycl_key" ON "automatic_runbook_attempts" ("execution_id", "sqs_message_id", "cycle_receive_count");

-- Seconda barriera indipendente dalla logica applicativa (§9.4): al massimo un
-- attempt RUNNING per execution, anche in caso di regressione o isolamento errato.
CREATE UNIQUE INDEX "automatic_runbook_attempts_one_running_per_execution"
  ON "automatic_runbook_attempts" ("execution_id")
  WHERE status = 'RUNNING';

-- ── Non-unique indexes ───────────────────────────────────────────────────────

CREATE INDEX "automatic_runbook_executions_alarm_event_id_created_at_idx" ON "automatic_runbook_executions" ("alarm_event_id", "created_at" DESC);
CREATE INDEX "automatic_runbook_executions_status_created_at_idx" ON "automatic_runbook_executions" ("status", "created_at");
CREATE INDEX "automatic_runbook_executions_status_last_heartbeat_at_idx" ON "automatic_runbook_executions" ("status", "last_heartbeat_at");
CREATE INDEX "automatic_runbook_executions_status_worker_deadline_at_idx" ON "automatic_runbook_executions" ("status", "worker_deadline_at");
CREATE INDEX "automatic_runbook_executions_status_deadline_at_idx" ON "automatic_runbook_executions" ("status", "deadline_at");
CREATE INDEX "automatic_runbook_executions_product_id_environment_id_crea_idx" ON "automatic_runbook_executions" ("product_id", "environment_id", "created_at" DESC);
CREATE INDEX "automatic_runbook_executions_alarm_id_outcome_created_at_idx" ON "automatic_runbook_executions" ("alarm_id", "outcome", "created_at" DESC);
CREATE INDEX "automatic_runbook_executions_review_status_created_at_idx" ON "automatic_runbook_executions" ("review_status", "created_at");
CREATE INDEX "automatic_runbook_executions_analysis_id_idx" ON "automatic_runbook_executions" ("analysis_id");
CREATE INDEX "automatic_runbook_executions_parent_execution_id_idx" ON "automatic_runbook_executions" ("parent_execution_id");
CREATE INDEX "automatic_runbook_executions_status_dispatch_kind_idx" ON "automatic_runbook_executions" ("status", "dispatch_kind");

CREATE INDEX "automatic_runbook_attempts_execution_id_started_at_idx" ON "automatic_runbook_attempts" ("execution_id", "started_at" DESC);
CREATE INDEX "automatic_runbook_attempts_status_last_heartbeat_at_idx" ON "automatic_runbook_attempts" ("status", "last_heartbeat_at");

-- ── Lifecycle / lease / cancellation invariants (§9.4 "Check DB lease/cancellazione") ──

-- Lease columns present only while a worker can still act (RUNNING|CANCEL_REQUESTED).
ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_lease_state_consistent" CHECK (
    (status IN ('RUNNING', 'CANCEL_REQUESTED') AND active_attempt_id IS NOT NULL AND worker_deadline_at IS NOT NULL)
    OR (status NOT IN ('RUNNING', 'CANCEL_REQUESTED') AND active_attempt_id IS NULL AND worker_deadline_at IS NULL)
  );

-- Cancellation columns consistency: CANCEL_REQUESTED keeps lease + request; CANCELLED is terminal.
ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_cancel_state_consistent" CHECK (
    (status = 'CANCEL_REQUESTED'
       AND cancel_request_id IS NOT NULL AND cancel_requested_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED'
       AND cancel_request_id IS NOT NULL AND cancel_requested_at IS NOT NULL
       AND cancelled_at IS NOT NULL AND cancellation_finalized_by IS NOT NULL
       AND outcome IS NULL AND error_code IS NULL)
    OR (status NOT IN ('CANCEL_REQUESTED', 'CANCELLED') AND cancelled_at IS NULL)
  );

-- QUEUED must carry queuedAt; deadline_at is NOT NULL by column definition (§9.4).
ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_queued_has_queued_at" CHECK (
    status <> 'QUEUED' OR queued_at IS NOT NULL
  );

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_executed_capability_complete" CHECK (
    (executed_runbook_key IS NULL AND executed_runbook_version IS NULL AND executed_runbook_digest IS NULL)
    OR (
      executed_runbook_key = requested_runbook_key
      AND executed_runbook_version = requested_runbook_version
      AND executed_runbook_digest = requested_runbook_digest
    )
  );

-- Completion hash is state-dependent: only COMPLETED attempts carry hash+version (§9.4).
ALTER TABLE "automatic_runbook_attempts"
  ADD CONSTRAINT "automatic_runbook_attempts_completion_hash_state" CHECK (
    (status = 'COMPLETED' AND completion_payload_hash IS NOT NULL AND completion_hash_version IS NOT NULL)
    OR (status <> 'COMPLETED' AND completion_payload_hash IS NULL AND completion_hash_version IS NULL)
  );

-- ── Foreign keys ─────────────────────────────────────────────────────────────

ALTER TABLE "alarm_analyses"
  ADD CONSTRAINT "alarm_analyses_last_applied_execution_id_fkey"
  FOREIGN KEY ("last_applied_execution_id") REFERENCES "automatic_runbook_executions" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_parent_execution_id_fkey"
  FOREIGN KEY ("parent_execution_id") REFERENCES "automatic_runbook_executions" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_alarm_event_id_fkey"
  FOREIGN KEY ("alarm_event_id") REFERENCES "alarm_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_analysis_id_fkey"
  FOREIGN KEY ("analysis_id") REFERENCES "alarm_analyses" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_triggered_by_user_id_fkey"
  FOREIGN KEY ("triggered_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_cancel_requested_by_user_id_fkey"
  FOREIGN KEY ("cancel_requested_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_executions"
  ADD CONSTRAINT "automatic_runbook_executions_active_attempt_id_fkey"
  FOREIGN KEY ("active_attempt_id") REFERENCES "automatic_runbook_attempts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automatic_runbook_attempts"
  ADD CONSTRAINT "automatic_runbook_attempts_execution_id_fkey"
  FOREIGN KEY ("execution_id") REFERENCES "automatic_runbook_executions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Constraint trigger: active_attempt_id must belong to the same execution (§9.4) ──
-- DEFERRABLE INITIALLY DEFERRED: la start crea l'attempt e poi imposta
-- active_attempt_id nella stessa transazione; il check è validato al commit.

CREATE OR REPLACE FUNCTION "automatic_runbook_active_attempt_same_execution"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active_attempt_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "automatic_runbook_attempts" a
      WHERE a.id = NEW.active_attempt_id AND a.execution_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'active_attempt_id % does not belong to execution %', NEW.active_attempt_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "automatic_runbook_active_attempt_same_execution_trg"
  AFTER INSERT OR UPDATE ON "automatic_runbook_executions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "automatic_runbook_active_attempt_same_execution"();

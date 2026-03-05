-- ═══════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════

CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');
CREATE TYPE "AnalysisType" AS ENUM ('ANALYZABLE', 'IGNORABLE');
CREATE TYPE "AnalysisStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE "Resource" AS ENUM ('PRODUCT', 'ENVIRONMENT', 'MICROSERVICE', 'IGNORED_ALARM', 'RUNBOOK', 'FINAL_ACTION', 'ALARM', 'ALARM_ANALYSIS', 'ALARM_EVENT', 'DOWNSTREAM', 'USER', 'SYSTEM_SETTING');
CREATE TYPE "PermissionScope" AS ENUM ('NONE', 'OWN', 'ALL');
CREATE TYPE "RunbookStatus" AS ENUM ('DRAFT', 'COMPLETE');

-- ═══════════════════════════════════════════════════════════
-- ROLES & PERMISSIONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "resource" "Resource" NOT NULL,
    "can_read" "PermissionScope" NOT NULL DEFAULT 'NONE'::"PermissionScope",
    "can_write" "PermissionScope" NOT NULL DEFAULT 'NONE'::"PermissionScope",
    "can_delete" "PermissionScope" NOT NULL DEFAULT 'NONE'::"PermissionScope",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_permission_overrides" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "resource" "Resource" NOT NULL,
    "can_read" "PermissionScope",
    "can_write" "PermissionScope",
    "can_delete" "PermissionScope",
    "granted_by" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "name" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "provider_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════
-- PRODUCTS & CONFIGURATION
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "environments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "product_id" UUID NOT NULL,
    "slack_channel_id" TEXT,
    "default_aws_account_id" TEXT,
    "default_aws_region" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "microservices" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microservices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ignored_alarms" (
    "id" UUID NOT NULL,
    "alarm_id" UUID NOT NULL,
    "environment_id" UUID NOT NULL,
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "product_id" UUID NOT NULL,
    "validity" JSONB NOT NULL DEFAULT '[]',
    "exclusions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ignored_alarms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "runbooks" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "link" TEXT NOT NULL,
    "status" "RunbookStatus" NOT NULL DEFAULT 'DRAFT',
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runbooks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alarms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_id" UUID NOT NULL,
    "runbook_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alarms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "final_actions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_other" BOOLEAN NOT NULL DEFAULT false,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "final_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "downstreams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downstreams_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════
-- IGNORE REASONS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "ignore_reasons" (
    "code"           TEXT    NOT NULL,
    "label"          TEXT    NOT NULL,
    "description"    TEXT,
    "sort_order"     INTEGER NOT NULL DEFAULT 0,
    "details_schema" JSONB,

    CONSTRAINT "ignore_reasons_pkey" PRIMARY KEY ("code")
);

-- ═══════════════════════════════════════════════════════════
-- ALARM ANALYSES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "alarm_analyses" (
    "id"                  UUID           NOT NULL,
    "analysis_date"       TIMESTAMP(3)   NOT NULL,
    "first_alarm_at"      TIMESTAMP(3)   NOT NULL,
    "last_alarm_at"       TIMESTAMP(3)   NOT NULL,
    "occurrences"         INTEGER        NOT NULL DEFAULT 1,
    "is_on_call"          BOOLEAN        NOT NULL DEFAULT false,
    "analysis_type"       "AnalysisType" NOT NULL DEFAULT 'ANALYZABLE',
    "status"              "AnalysisStatus" NOT NULL DEFAULT 'CREATED',
    "alarm_id"            UUID           NOT NULL,
    "error_details"       TEXT,
    "conclusion_notes"    TEXT,
    "ignore_reason_code"  TEXT,
    "ignore_details"      JSONB,
    "operator_id"         UUID           NOT NULL,
    "product_id"          UUID           NOT NULL,
    "environment_id"      UUID           NOT NULL,
    "runbook_id"          UUID,
    "links"               JSONB          NOT NULL DEFAULT '[]',
    "tracking_ids"        JSONB          NOT NULL DEFAULT '[]',
    "validation_score"    SMALLINT,
    "quality_score"       SMALLINT,
    "scored_at"           TIMESTAMP(3),
    "created_at"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)   NOT NULL,
    "created_by_id"       UUID           NOT NULL,
    "updated_by_id"       UUID,

    CONSTRAINT "alarm_analyses_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════
-- ALARM EVENTS
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "alarm_events" (
    "id"              UUID         NOT NULL,
    "name"            TEXT         NOT NULL,
    "fired_at"        TIMESTAMP(3) NOT NULL,
    "description"     TEXT,
    "reason"          TEXT,
    "aws_region"      TEXT         NOT NULL,
    "aws_account_id"  TEXT         NOT NULL,
    "product_id"      UUID         NOT NULL,
    "environment_id"  UUID         NOT NULL,
    "alarm_id"        UUID,
    -- Identificatore univoco del messaggio Slack sorgente ("{channelId}/{ts}").
    -- Garantisce idempotenza nello script di ingestione Slack.
    "slack_message_id" TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_events_pkey"            PRIMARY KEY ("id"),
    CONSTRAINT "alarm_events_slack_message_id_key" UNIQUE ("slack_message_id")
);

-- ═══════════════════════════════════════════════════════════
-- SYSTEM SETTINGS & EVENT LOG
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    -- Formato semantico del valore (es. "WORKING_HOURS").
    -- null per tipi primitivi o JSON senza shape specifica.
    -- Valori gestiti dalla costante SettingFormats in @go-watchtower/shared
    "format" TEXT,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "user_label" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resource_id" TEXT,
    "resource_label" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════
-- JOIN TABLES (many-to-many)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE "analysis_microservices" (
    "analysis_id" UUID NOT NULL,
    "microservice_id" UUID NOT NULL,

    CONSTRAINT "analysis_microservices_pkey" PRIMARY KEY ("analysis_id","microservice_id")
);

CREATE TABLE "analysis_downstreams" (
    "analysis_id" UUID NOT NULL,
    "downstream_id" UUID NOT NULL,

    CONSTRAINT "analysis_downstreams_pkey" PRIMARY KEY ("analysis_id","downstream_id")
);

CREATE TABLE "analysis_final_actions" (
    "analysis_id" UUID NOT NULL,
    "final_action_id" UUID NOT NULL,

    CONSTRAINT "analysis_final_actions_pkey" PRIMARY KEY ("analysis_id","final_action_id")
);

-- ═══════════════════════════════════════════════════════════
-- UNIQUE INDEXES
-- ═══════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE UNIQUE INDEX "role_permissions_role_id_resource_key" ON "role_permissions"("role_id", "resource");
CREATE UNIQUE INDEX "user_permission_overrides_user_id_resource_key" ON "user_permission_overrides"("user_id", "resource");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE UNIQUE INDEX "products_name_key" ON "products"("name");
CREATE UNIQUE INDEX "environments_product_id_name_key" ON "environments"("product_id", "name");
CREATE UNIQUE INDEX "microservices_product_id_name_key" ON "microservices"("product_id", "name");
CREATE UNIQUE INDEX "ignored_alarms_alarm_id_environment_id_key" ON "ignored_alarms"("alarm_id", "environment_id");
CREATE UNIQUE INDEX "runbooks_product_id_name_key" ON "runbooks"("product_id", "name");
CREATE UNIQUE INDEX "alarms_product_id_name_key" ON "alarms"("product_id", "name");
CREATE UNIQUE INDEX "final_actions_product_id_name_key" ON "final_actions"("product_id", "name");
CREATE UNIQUE INDEX "downstreams_product_id_name_key" ON "downstreams"("product_id", "name");

-- ═══════════════════════════════════════════════════════════
-- INDEXES
--
-- Design notes:
-- - No standalone index on alarm_analyses(product_id): covered by composite (product_id, analysis_date)
-- - No index on alarm_analyses(analysis_type): low cardinality (2 values), never leading filter
-- - No index on alarm_analyses(status): low cardinality (3 values), never leading filter
-- - No standalone index on role_permissions(role_id): covered by unique (role_id, resource)
-- - No standalone index on user_permission_overrides(user_id): covered by unique (user_id, resource)
-- ═══════════════════════════════════════════════════════════

-- users
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- user_permission_overrides
CREATE INDEX "user_permission_overrides_granted_by_idx" ON "user_permission_overrides"("granted_by");

-- refresh_tokens
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- ignored_alarms
CREATE INDEX "ignored_alarms_product_id_idx" ON "ignored_alarms"("product_id");
CREATE INDEX "ignored_alarms_environment_id_idx" ON "ignored_alarms"("environment_id");

-- alarms
CREATE INDEX "alarms_runbook_id_idx" ON "alarms"("runbook_id");

-- alarm_analyses
CREATE INDEX "alarm_analyses_analysis_date_idx" ON "alarm_analyses"("analysis_date");
CREATE INDEX "alarm_analyses_product_id_analysis_date_idx" ON "alarm_analyses"("product_id", "analysis_date");
CREATE INDEX "alarm_analyses_environment_id_idx" ON "alarm_analyses"("environment_id");
CREATE INDEX "alarm_analyses_operator_id_idx" ON "alarm_analyses"("operator_id");
CREATE INDEX "alarm_analyses_alarm_id_idx" ON "alarm_analyses"("alarm_id");
CREATE INDEX "alarm_analyses_runbook_id_idx" ON "alarm_analyses"("runbook_id");
CREATE INDEX "alarm_analyses_created_by_id_idx" ON "alarm_analyses"("created_by_id");
CREATE INDEX "alarm_analyses_updated_by_id_idx" ON "alarm_analyses"("updated_by_id");
CREATE INDEX "alarm_analyses_created_at_idx" ON "alarm_analyses"("created_at");
CREATE INDEX "alarm_analyses_ignore_reason_code_idx" ON "alarm_analyses"("ignore_reason_code");

-- join tables: reverse FK indexes (PK only covers leading column)
CREATE INDEX "analysis_microservices_microservice_id_idx" ON "analysis_microservices"("microservice_id");
CREATE INDEX "analysis_downstreams_downstream_id_idx" ON "analysis_downstreams"("downstream_id");
CREATE INDEX "analysis_final_actions_final_action_id_idx" ON "analysis_final_actions"("final_action_id");

-- system_settings
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- alarm_events
CREATE INDEX "alarm_events_fired_at_idx" ON "alarm_events"("fired_at");
CREATE INDEX "alarm_events_product_id_fired_at_idx" ON "alarm_events"("product_id", "fired_at");
CREATE INDEX "alarm_events_environment_id_idx" ON "alarm_events"("environment_id");
CREATE INDEX "alarm_events_aws_account_id_idx" ON "alarm_events"("aws_account_id");
CREATE INDEX "alarm_events_alarm_id_idx" ON "alarm_events"("alarm_id");

-- system_events
CREATE INDEX "system_events_user_id_idx" ON "system_events"("user_id");
CREATE INDEX "system_events_action_idx" ON "system_events"("action");
CREATE INDEX "system_events_resource_resource_id_idx" ON "system_events"("resource", "resource_id");
CREATE INDEX "system_events_created_at_idx" ON "system_events"("created_at");

-- ═══════════════════════════════════════════════════════════
-- SLACK INGESTOR
-- ═══════════════════════════════════════════════════════════

-- Cursori di avanzamento per canale Slack (ingestione incrementale)
CREATE TABLE "slack_channel_cursors" (
    "channel_id" TEXT         NOT NULL,
    "latest_ts"  TEXT         NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_channel_cursors_pkey" PRIMARY KEY ("channel_id")
);

-- ═══════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════

-- Roles & Permissions
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Users
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Products & Configuration
ALTER TABLE "environments" ADD CONSTRAINT "environments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "microservices" ADD CONSTRAINT "microservices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ignored_alarms" ADD CONSTRAINT "ignored_alarms_alarm_id_fkey" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ignored_alarms" ADD CONSTRAINT "ignored_alarms_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ignored_alarms" ADD CONSTRAINT "ignored_alarms_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runbooks" ADD CONSTRAINT "runbooks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alarms" ADD CONSTRAINT "alarms_runbook_id_fkey" FOREIGN KEY ("runbook_id") REFERENCES "runbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "final_actions" ADD CONSTRAINT "final_actions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "downstreams" ADD CONSTRAINT "downstreams_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alarm Analyses
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_alarm_id_fkey" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_runbook_id_fkey" FOREIGN KEY ("runbook_id") REFERENCES "runbooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_analyses" ADD CONSTRAINT "alarm_analyses_ignore_reason_code_fkey" FOREIGN KEY ("ignore_reason_code") REFERENCES "ignore_reasons"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- Join tables
ALTER TABLE "analysis_microservices" ADD CONSTRAINT "analysis_microservices_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "alarm_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_microservices" ADD CONSTRAINT "analysis_microservices_microservice_id_fkey" FOREIGN KEY ("microservice_id") REFERENCES "microservices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_downstreams" ADD CONSTRAINT "analysis_downstreams_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "alarm_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_downstreams" ADD CONSTRAINT "analysis_downstreams_downstream_id_fkey" FOREIGN KEY ("downstream_id") REFERENCES "downstreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_final_actions" ADD CONSTRAINT "analysis_final_actions_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "alarm_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_final_actions" ADD CONSTRAINT "analysis_final_actions_final_action_id_fkey" FOREIGN KEY ("final_action_id") REFERENCES "final_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alarm Events
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alarm_events" ADD CONSTRAINT "alarm_events_alarm_id_fkey" FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- System Settings & Event Log
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

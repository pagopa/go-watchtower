-- ═══════════════════════════════════════════════════════════
-- PRIORITY LEVELS & RULES
-- ═══════════════════════════════════════════════════════════

CREATE TYPE "AlarmPriorityMatcherType" AS ENUM (
  'ALARM_ID',
  'ALARM_NAME_PREFIX',
  'ALARM_NAME_REGEX'
);

DO $$
BEGIN
  ALTER TYPE "SystemComponent" ADD VALUE 'ALARM_PRIORITY_RULE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "SystemComponent" ADD VALUE 'PRIORITY_LEVEL';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "priority_levels" (
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT,
  "icon" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "counts_as_on_call" BOOLEAN NOT NULL DEFAULT false,
  "default_notify" BOOLEAN NOT NULL DEFAULT false,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "priority_levels_pkey" PRIMARY KEY ("code")
);

INSERT INTO "priority_levels" (
  "code",
  "label",
  "description",
  "rank",
  "color",
  "icon",
  "is_active",
  "is_default",
  "counts_as_on_call",
  "default_notify",
  "is_system"
)
VALUES
  (
    'NORMAL',
    'Normale',
    'Priorità operativa standard applicata quando nessuna regola specifica fa match.',
    0,
    'zinc',
    'minus',
    true,
    true,
    false,
    false,
    true
  ),
  (
    'HIGH',
    'High',
    'Priorità operativa elevata per allarmi che richiedono attenzione rapida.',
    50,
    'amber',
    'triangle-alert',
    true,
    false,
    false,
    true,
    true
  ),
  (
    'ON_CALL',
    'On-Call',
    'Priorità operativa massima per allarmi di reperibilità.',
    100,
    'rose',
    'phone-call',
    true,
    false,
    true,
    true,
    true
  )
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "alarm_priority_rules" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "environment_id" UUID,
  "priority_code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "matcher_type" "AlarmPriorityMatcherType" NOT NULL,
  "alarm_id" UUID,
  "name_prefix" TEXT,
  "name_pattern" TEXT,
  "precedence" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "validity" JSONB NOT NULL DEFAULT '[]',
  "exclusions" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alarm_priority_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alarm_priority_rules_matcher_consistency_chk" CHECK (
    (
      "matcher_type" = 'ALARM_ID'
      AND "alarm_id" IS NOT NULL
      AND "name_prefix" IS NULL
      AND "name_pattern" IS NULL
    ) OR (
      "matcher_type" = 'ALARM_NAME_PREFIX'
      AND "alarm_id" IS NULL
      AND "name_prefix" IS NOT NULL
      AND length(trim("name_prefix")) > 0
      AND "name_pattern" IS NULL
    ) OR (
      "matcher_type" = 'ALARM_NAME_REGEX'
      AND "alarm_id" IS NULL
      AND "name_prefix" IS NULL
      AND "name_pattern" IS NOT NULL
      AND length(trim("name_pattern")) > 0
    )
  )
);

ALTER TABLE "alarm_priority_rules"
  ADD CONSTRAINT "alarm_priority_rules_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alarm_priority_rules"
  ADD CONSTRAINT "alarm_priority_rules_environment_id_fkey"
    FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alarm_priority_rules"
  ADD CONSTRAINT "alarm_priority_rules_priority_code_fkey"
    FOREIGN KEY ("priority_code") REFERENCES "priority_levels"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "alarm_priority_rules"
  ADD CONSTRAINT "alarm_priority_rules_alarm_id_fkey"
    FOREIGN KEY ("alarm_id") REFERENCES "alarms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "alarm_events"
  ADD COLUMN "priority_code" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "priority_rule_id" UUID,
  ADD COLUMN "priority_resolved_at" TIMESTAMP(3);

ALTER TABLE "alarm_events"
  ADD CONSTRAINT "alarm_events_priority_code_fkey"
    FOREIGN KEY ("priority_code") REFERENCES "priority_levels"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "alarm_events"
  ADD CONSTRAINT "alarm_events_priority_rule_id_fkey"
    FOREIGN KEY ("priority_rule_id") REFERENCES "alarm_priority_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "priority_levels_is_active_idx" ON "priority_levels"("is_active");
CREATE INDEX "priority_levels_is_default_idx" ON "priority_levels"("is_default");
CREATE INDEX "priority_levels_rank_idx" ON "priority_levels"("rank");

CREATE INDEX "alarm_priority_rules_product_is_active_idx"
  ON "alarm_priority_rules"("product_id", "is_active");

CREATE INDEX "alarm_priority_rules_product_environment_is_active_idx"
  ON "alarm_priority_rules"("product_id", "environment_id", "is_active");

CREATE INDEX "alarm_priority_rules_product_alarm_environment_is_active_idx"
  ON "alarm_priority_rules"("product_id", "alarm_id", "environment_id", "is_active");

CREATE INDEX "alarm_priority_rules_priority_code_idx"
  ON "alarm_priority_rules"("priority_code");

CREATE INDEX "alarm_events_priority_code_idx"
  ON "alarm_events"("priority_code");

CREATE INDEX "alarm_events_priority_rule_id_idx"
  ON "alarm_events"("priority_rule_id");

CREATE INDEX "alarm_events_product_priority_fired_idx"
  ON "alarm_events"("product_id", "priority_code", "fired_at");

CREATE INDEX "alarm_events_environment_priority_fired_idx"
  ON "alarm_events"("environment_id", "priority_code", "fired_at");

-- ═══════════════════════════════════════════════════════════
-- LEGACY CONFIGURATION MIGRATION
-- ═══════════════════════════════════════════════════════════

WITH product_environment_stats AS (
  SELECT
    e.product_id,
    COUNT(*) AS total_environment_count,
    COUNT(*) FILTER (
      WHERE e.on_call_alarm_pattern IS NOT NULL
        AND length(trim(e.on_call_alarm_pattern)) > 0
    ) AS patterned_environment_count,
    COUNT(DISTINCT trim(e.on_call_alarm_pattern)) FILTER (
      WHERE e.on_call_alarm_pattern IS NOT NULL
        AND length(trim(e.on_call_alarm_pattern)) > 0
    ) AS distinct_pattern_count,
    MIN(trim(e.on_call_alarm_pattern)) FILTER (
      WHERE e.on_call_alarm_pattern IS NOT NULL
        AND length(trim(e.on_call_alarm_pattern)) > 0
    ) AS shared_name_pattern
  FROM "environments" e
  GROUP BY e.product_id
),
shared_product_rules AS (
  SELECT
    (
      substr(md5('on-call-product-rule:' || s.product_id::text), 1, 8) || '-' ||
      substr(md5('on-call-product-rule:' || s.product_id::text), 9, 4) || '-' ||
      substr(md5('on-call-product-rule:' || s.product_id::text), 13, 4) || '-' ||
      substr(md5('on-call-product-rule:' || s.product_id::text), 17, 4) || '-' ||
      substr(md5('on-call-product-rule:' || s.product_id::text), 21, 12)
    )::uuid AS id,
    s.product_id,
    NULL::uuid AS environment_id,
    s.shared_name_pattern AS name_pattern
  FROM product_environment_stats s
  WHERE s.total_environment_count = s.patterned_environment_count
    AND s.patterned_environment_count > 0
    AND s.distinct_pattern_count = 1
),
env_rules AS (
  SELECT
    (
      substr(md5('on-call-rule:' || e.id::text), 1, 8) || '-' ||
      substr(md5('on-call-rule:' || e.id::text), 9, 4) || '-' ||
      substr(md5('on-call-rule:' || e.id::text), 13, 4) || '-' ||
      substr(md5('on-call-rule:' || e.id::text), 17, 4) || '-' ||
      substr(md5('on-call-rule:' || e.id::text), 21, 12)
    )::uuid AS id,
    e.product_id,
    e.id AS environment_id,
    trim(e.on_call_alarm_pattern) AS name_pattern
  FROM "environments" e
  JOIN product_environment_stats s
    ON s.product_id = e.product_id
  WHERE e.on_call_alarm_pattern IS NOT NULL
    AND length(trim(e.on_call_alarm_pattern)) > 0
    AND NOT (
      s.total_environment_count = s.patterned_environment_count
      AND s.patterned_environment_count > 0
      AND s.distinct_pattern_count = 1
    )
)
INSERT INTO "alarm_priority_rules" (
  "id",
  "product_id",
  "environment_id",
  "priority_code",
  "name",
  "matcher_type",
  "name_pattern",
  "precedence",
  "note",
  "is_active",
  "validity",
  "exclusions"
)
SELECT
  r.id,
  r.product_id,
  r.environment_id,
  'ON_CALL',
  'Migrated ON_CALL from environment pattern',
  'ALARM_NAME_REGEX'::"AlarmPriorityMatcherType",
  r.name_pattern,
  1000,
  'Migrated from environments.on_call_alarm_pattern',
  true,
  '[]'::jsonb,
  '[]'::jsonb
FROM (
  SELECT * FROM shared_product_rules
  UNION ALL
  SELECT * FROM env_rules
) r
ON CONFLICT ("id") DO NOTHING;

WITH product_rules AS (
  SELECT
    (
      substr(md5('high-rule:' || p.id::text), 1, 8) || '-' ||
      substr(md5('high-rule:' || p.id::text), 9, 4) || '-' ||
      substr(md5('high-rule:' || p.id::text), 13, 4) || '-' ||
      substr(md5('high-rule:' || p.id::text), 17, 4) || '-' ||
      substr(md5('high-rule:' || p.id::text), 21, 12)
    )::uuid AS id,
    p.id AS product_id
  FROM "products" p
)
INSERT INTO "alarm_priority_rules" (
  "id",
  "product_id",
  "environment_id",
  "priority_code",
  "name",
  "matcher_type",
  "name_prefix",
  "precedence",
  "note",
  "is_active",
  "validity",
  "exclusions"
)
SELECT
  r.id,
  r.product_id,
  NULL,
  'HIGH',
  'Migrated HIGH workday prefix',
  'ALARM_NAME_PREFIX'::"AlarmPriorityMatcherType",
  'workday-',
  500,
  'Migrated from hardcoded HIGH prefix',
  true,
  '[]'::jsonb,
  '[]'::jsonb
FROM product_rules r
ON CONFLICT ("id") DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- INITIAL EVENT BACKFILL
-- ═══════════════════════════════════════════════════════════

UPDATE "alarm_events"
SET
  "priority_code" = 'NORMAL',
  "priority_rule_id" = NULL,
  "priority_resolved_at" = CURRENT_TIMESTAMP
WHERE "priority_resolved_at" IS NULL;

WITH ranked_oncall_matches AS (
  SELECT
    ae."id" AS alarm_event_id,
    apr."id" AS priority_rule_id,
    ROW_NUMBER() OVER (
      PARTITION BY ae."id"
      ORDER BY
        CASE WHEN apr."environment_id" IS NOT NULL THEN 1 ELSE 0 END DESC,
        apr."precedence" DESC,
        apr."created_at" ASC,
        apr."id" ASC
    ) AS rn
  FROM "alarm_events" ae
  JOIN "alarm_priority_rules" apr
    ON apr."product_id" = ae."product_id"
   AND apr."priority_code" = 'ON_CALL'
   AND apr."matcher_type" = 'ALARM_NAME_REGEX'
   AND apr."is_active" = true
   AND (apr."environment_id" IS NULL OR apr."environment_id" = ae."environment_id")
   AND ae."name" ~ apr."name_pattern"
)
UPDATE "alarm_events" ae
SET
  "priority_code" = 'ON_CALL',
  "priority_rule_id" = rom."priority_rule_id",
  "priority_resolved_at" = CURRENT_TIMESTAMP
FROM ranked_oncall_matches rom
WHERE rom.rn = 1
  AND rom.alarm_event_id = ae."id";

UPDATE "alarm_events" ae
SET
  "priority_code" = 'HIGH',
  "priority_rule_id" = apr."id",
  "priority_resolved_at" = CURRENT_TIMESTAMP
FROM "alarm_priority_rules" apr
WHERE apr."priority_code" = 'HIGH'
  AND apr."matcher_type" = 'ALARM_NAME_PREFIX'
  AND apr."is_active" = true
  AND apr."product_id" = ae."product_id"
  AND ae."priority_code" = 'NORMAL'
  AND ae."name" LIKE apr."name_prefix" || '%';

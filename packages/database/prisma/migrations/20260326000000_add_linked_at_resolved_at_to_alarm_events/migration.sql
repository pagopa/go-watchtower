-- AlterTable: add linked_at and resolved_at to alarm_events
ALTER TABLE "alarm_events" ADD COLUMN "linked_at" TIMESTAMP(3);
ALTER TABLE "alarm_events" ADD COLUMN "resolved_at" TIMESTAMP(3);

-- Backfill: linked_at = analysis_date for events already linked to an analysis
UPDATE "alarm_events" ae
SET "linked_at" = aa."analysis_date"
FROM "alarm_analyses" aa
WHERE ae."analysis_id" = aa."id"
  AND ae."analysis_id" IS NOT NULL;

-- Backfill: resolved_at = updated_at for events linked to COMPLETED analyses
UPDATE "alarm_events" ae
SET "resolved_at" = aa."updated_at"
FROM "alarm_analyses" aa
WHERE ae."analysis_id" = aa."id"
  AND ae."analysis_id" IS NOT NULL
  AND aa."status" = 'COMPLETED';

-- Partial indexes for report queries (global MTTA/MTTR trend grouped by period)
CREATE INDEX "idx_alarm_events_linked_at" ON "alarm_events" ("linked_at") WHERE "linked_at" IS NOT NULL;
CREATE INDEX "idx_alarm_events_resolved_at" ON "alarm_events" ("resolved_at") WHERE "resolved_at" IS NOT NULL;

-- Composite partial indexes for alarm detail queries (filter by alarm_id + range on linked_at/resolved_at)
CREATE INDEX "idx_alarm_events_alarm_linked" ON "alarm_events" ("alarm_id", "linked_at") WHERE "linked_at" IS NOT NULL;
CREATE INDEX "idx_alarm_events_alarm_resolved" ON "alarm_events" ("alarm_id", "resolved_at") WHERE "resolved_at" IS NOT NULL;

-- CreateTable
CREATE TABLE "resource_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_types_name_key" ON "resource_types"("name");

-- Seed default resource types
INSERT INTO "resource_types" ("id", "name", "sort_order", "created_at", "updated_at") VALUES
    ('d0000000-0000-0000-0000-000000000001', 'Service',     1, NOW(), NOW()),
    ('d0000000-0000-0000-0000-000000000002', 'Development', 2, NOW(), NOW()),
    ('d0000000-0000-0000-0000-000000000003', 'Lambda',      3, NOW(), NOW()),
    ('d0000000-0000-0000-0000-000000000004', 'Cronjob',     4, NOW(), NOW());

-- Add type_id column (nullable initially)
ALTER TABLE "resources" ADD COLUMN "type_id" UUID;

-- Set all existing resources to "Service" type
UPDATE "resources" SET "type_id" = 'd0000000-0000-0000-0000-000000000001' WHERE "type_id" IS NULL;

-- Make type_id NOT NULL
ALTER TABLE "resources" ALTER COLUMN "type_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "resource_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "resources_type_id_idx" ON "resources"("type_id");

-- DropIndex (cleanup pre-existing drift)
DROP INDEX IF EXISTS "idx_alarm_analyses_conclusion_notes_trgm";
DROP INDEX IF EXISTS "idx_alarm_analyses_error_details_trgm";
DROP INDEX IF EXISTS "refresh_tokens_user_id_idx";

-- CreateIndex (align with schema)
CREATE INDEX "alarm_analyses_product_id_status_idx" ON "alarm_analyses"("product_id", "status");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

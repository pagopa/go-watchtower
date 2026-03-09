-- ═══════════════════════════════════════════════════════════
-- Rename: Microservice → Resource
-- ═══════════════════════════════════════════════════════════

-- 1. Rename the enum type
ALTER TYPE "Resource" RENAME TO "SystemComponent";

-- 2. Rename the enum value MICROSERVICE → RESOURCE
ALTER TYPE "SystemComponent" RENAME VALUE 'MICROSERVICE' TO 'RESOURCE';

-- 3. Rename table microservices → resources
ALTER TABLE "microservices" RENAME TO "resources";

-- 4. Rename table analysis_microservices → analysis_resources
ALTER TABLE "analysis_microservices" RENAME TO "analysis_resources";

-- 5. Rename column microservice_id → resource_id in analysis_resources
ALTER TABLE "analysis_resources" RENAME COLUMN "microservice_id" TO "resource_id";

-- 6. Rename the primary key constraint on resources (was microservices_pkey)
ALTER INDEX "microservices_pkey" RENAME TO "resources_pkey";

-- 7. Rename the unique index on resources
ALTER INDEX "microservices_product_id_name_key" RENAME TO "resources_product_id_name_key";

-- 8. Rename the primary key constraint on analysis_resources
ALTER INDEX "analysis_microservices_pkey" RENAME TO "analysis_resources_pkey";

-- 9. Rename the non-unique index on analysis_resources
ALTER INDEX "analysis_microservices_microservice_id_idx" RENAME TO "analysis_resources_resource_id_idx";

-- 10. Rename foreign key constraints on resources (was microservices)
ALTER TABLE "resources" RENAME CONSTRAINT "microservices_product_id_fkey" TO "resources_product_id_fkey";

-- 11. Rename foreign key constraints on analysis_resources
ALTER TABLE "analysis_resources" RENAME CONSTRAINT "analysis_microservices_analysis_id_fkey" TO "analysis_resources_analysis_id_fkey";
ALTER TABLE "analysis_resources" RENAME CONSTRAINT "analysis_microservices_microservice_id_fkey" TO "analysis_resources_resource_id_fkey";

-- 12. Update system_events historical records
UPDATE "system_events" SET "resource" = 'resources' WHERE "resource" = 'microservices';
UPDATE "system_events" SET "action" = REPLACE("action", 'MICROSERVICE_', 'RESOURCE_') WHERE "action" LIKE 'MICROSERVICE_%';

-- CreateIndex
CREATE INDEX "alarm_analyses_product_id_environment_id_analysis_date_idx" ON "alarm_analyses"("product_id", "environment_id", "analysis_date");

-- CreateIndex
CREATE INDEX "alarm_analyses_tracking_ids_idx" ON "alarm_analyses" USING GIN ("tracking_ids");

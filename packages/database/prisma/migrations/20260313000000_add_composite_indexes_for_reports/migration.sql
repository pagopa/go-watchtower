-- CreateIndex
CREATE INDEX "alarm_analyses_environment_id_analysis_date_idx" ON "alarm_analyses"("environment_id", "analysis_date");

-- CreateIndex
CREATE INDEX "alarm_events_environment_id_fired_at_idx" ON "alarm_events"("environment_id", "fired_at");

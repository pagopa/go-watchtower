-- Restore GIN trigram indexes for fast ILIKE '%term%' searches
-- (accidentally dropped in 20260310000000_add_resource_types)
CREATE INDEX IF NOT EXISTS idx_alarm_analyses_error_details_trgm
  ON alarm_analyses USING gin (error_details gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alarm_analyses_conclusion_notes_trgm
  ON alarm_analyses USING gin (conclusion_notes gin_trgm_ops);

--- Composite index for filtering by environment + status
CREATE INDEX IF NOT EXISTS idx_alarm_analyses_environment_id_status
  ON alarm_analyses (environment_id, status);
-- Enable pg_trgm extension for fast ILIKE '%term%' searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for text search on alarm_analyses
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alarm_analyses_error_details_trgm
  ON alarm_analyses USING gin (error_details gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alarm_analyses_conclusion_notes_trgm
  ON alarm_analyses USING gin (conclusion_notes gin_trgm_ops);

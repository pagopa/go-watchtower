CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_alarm_events_name_trgm
  ON alarm_events USING gin (name gin_trgm_ops);

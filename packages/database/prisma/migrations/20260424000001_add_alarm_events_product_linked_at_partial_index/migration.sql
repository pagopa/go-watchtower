CREATE INDEX IF NOT EXISTS idx_alarm_events_product_linked_at
  ON alarm_events (product_id, linked_at)
  WHERE linked_at IS NOT NULL;

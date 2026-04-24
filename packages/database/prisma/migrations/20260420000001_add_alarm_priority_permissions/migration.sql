-- ═══════════════════════════════════════════════════════════
-- ALARM PRIORITY RBAC DATA MIGRATION
-- ═══════════════════════════════════════════════════════════
--
-- PostgreSQL does not allow using enum values added with ALTER TYPE ADD VALUE
-- before the transaction that added them is committed. This must therefore run
-- after 20260420000000_add_alarm_priority_v4.
--
-- Insert only missing permissions. Existing rows are intentionally preserved to
-- avoid overwriting production customisations made outside the standard seed.

WITH priority_permissions(role_name, resource, can_read, can_write, can_delete) AS (
  VALUES
    ('GUEST',     'ALARM_PRIORITY_RULE', 'ALL', 'NONE', 'NONE'),
    ('GUEST',     'PRIORITY_LEVEL',      'ALL', 'NONE', 'NONE'),
    ('OPERATOR',  'ALARM_PRIORITY_RULE', 'ALL', 'NONE', 'NONE'),
    ('OPERATOR',  'PRIORITY_LEVEL',      'ALL', 'NONE', 'NONE'),
    ('TEAM_LEAD', 'ALARM_PRIORITY_RULE', 'ALL', 'ALL',  'NONE'),
    ('TEAM_LEAD', 'PRIORITY_LEVEL',      'ALL', 'NONE', 'NONE'),
    ('ADMIN',     'ALARM_PRIORITY_RULE', 'ALL', 'ALL',  'ALL'),
    ('ADMIN',     'PRIORITY_LEVEL',      'ALL', 'ALL',  'ALL')
)
INSERT INTO "role_permissions" (
  "id",
  "role_id",
  "resource",
  "can_read",
  "can_write",
  "can_delete",
  "created_at",
  "updated_at"
)
SELECT
  (
    substr(md5('priority-permission:' || r."id"::text || ':' || p.resource), 1, 8) || '-' ||
    substr(md5('priority-permission:' || r."id"::text || ':' || p.resource), 9, 4) || '-' ||
    substr(md5('priority-permission:' || r."id"::text || ':' || p.resource), 13, 4) || '-' ||
    substr(md5('priority-permission:' || r."id"::text || ':' || p.resource), 17, 4) || '-' ||
    substr(md5('priority-permission:' || r."id"::text || ':' || p.resource), 21, 12)
  )::uuid,
  r."id",
  p.resource::"SystemComponent",
  p.can_read::"PermissionScope",
  p.can_write::"PermissionScope",
  p.can_delete::"PermissionScope",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM priority_permissions p
JOIN "roles" r ON r."name" = p.role_name
ON CONFLICT ("role_id", "resource") DO NOTHING;

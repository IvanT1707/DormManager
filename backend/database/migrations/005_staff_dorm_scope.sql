BEGIN;

CREATE TABLE staff_dorm_assignment (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dorm_id BIGINT NOT NULL REFERENCES dorm(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_dorm_assignment_period_valid CHECK (
    ended_at IS NULL OR ended_at >= assigned_at
  ),
  CONSTRAINT staff_dorm_assignment_unique UNIQUE (user_id, dorm_id)
);

CREATE INDEX staff_dorm_active_user_index
  ON staff_dorm_assignment(user_id, dorm_id)
  WHERE active = TRUE;

ALTER TABLE application
  ADD COLUMN managed_dorm_id BIGINT REFERENCES dorm(id) ON DELETE SET NULL;

CREATE INDEX application_managed_dorm_index
  ON application(managed_dorm_id, status);

UPDATE application AS a
SET managed_dorm_id = COALESCE(
  (SELECT r.dorm_id FROM room AS r WHERE r.id = a.assigned_room_id),
  (SELECT r.dorm_id FROM room AS r WHERE r.id = a.room_id),
  (
    SELECT r.dorm_id
    FROM residence AS rs
    JOIN room AS r ON r.id = rs.room_id
    WHERE rs.user_id = a.user_id AND rs.status = 'active'
    LIMIT 1
  )
)
WHERE a.managed_dorm_id IS NULL
  AND COALESCE(
    (SELECT r.dorm_id FROM room AS r WHERE r.id = a.assigned_room_id),
    (SELECT r.dorm_id FROM room AS r WHERE r.id = a.room_id),
    (
      SELECT r.dorm_id
      FROM residence AS rs
      JOIN room AS r ON r.id = rs.room_id
      WHERE rs.user_id = a.user_id AND rs.status = 'active'
      LIMIT 1
    )
  ) IS NOT NULL;

COMMIT;

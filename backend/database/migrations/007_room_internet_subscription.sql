BEGIN;

CREATE TYPE room_service_status AS ENUM ('inactive', 'active', 'suspended');

CREATE TABLE room_internet_subscription (
  room_id BIGINT PRIMARY KEY REFERENCES room(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  status room_service_status NOT NULL DEFAULT 'inactive',
  activated_at DATE,
  suspended_at DATE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_internet_dates_valid CHECK (
    suspended_at IS NULL OR activated_at IS NULL OR suspended_at >= activated_at
  )
);

COMMIT;

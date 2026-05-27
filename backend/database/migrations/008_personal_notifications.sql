BEGIN;

CREATE TYPE notification_type AS ENUM (
  'payment_reminder',
  'application_update',
  'disciplinary_record',
  'internet_status',
  'staff_assignment',
  'system'
);

CREATE TYPE notification_priority AS ENUM ('info', 'warning', 'urgent');

CREATE TABLE notification (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  priority notification_priority NOT NULL DEFAULT 'info',
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(40),
  related_entity_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key VARCHAR(180) NOT NULL UNIQUE,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX notification_recipient_created_index
  ON notification(recipient_user_id, created_at DESC);

CREATE INDEX notification_recipient_unread_index
  ON notification(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE notification_job_run (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(80) NOT NULL,
  business_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT notification_job_daily_unique UNIQUE (job_name, business_date)
);

COMMIT;

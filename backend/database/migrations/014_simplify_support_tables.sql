BEGIN;

CREATE TABLE job_run (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(80) NOT NULL,
  business_date DATE NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT job_run_daily_unique UNIQUE (job_name, business_date)
);

INSERT INTO job_run (job_name, business_date, payload, completed_at)
SELECT
  job_name,
  business_date,
  jsonb_build_object('generatedCount', generated_count),
  completed_at
FROM notification_job_run
ON CONFLICT (job_name, business_date) DO UPDATE SET
  payload = job_run.payload || EXCLUDED.payload,
  completed_at = GREATEST(job_run.completed_at, EXCLUDED.completed_at);

INSERT INTO job_run (job_name, business_date, payload, completed_at)
SELECT
  job_name,
  business_date,
  jsonb_build_object(
    'internetCreatedCount', internet_created_count,
    'accommodationCreatedCount', accommodation_created_count
  ),
  completed_at
FROM billing_job_run
ON CONFLICT (job_name, business_date) DO UPDATE SET
  payload = job_run.payload || EXCLUDED.payload,
  completed_at = GREATEST(job_run.completed_at, EXCLUDED.completed_at);

ALTER TABLE room
  ADD COLUMN internet_service_id BIGINT REFERENCES service(id) ON DELETE RESTRICT,
  ADD COLUMN internet_status room_service_status NOT NULL DEFAULT 'inactive',
  ADD COLUMN internet_activated_at DATE,
  ADD COLUMN internet_suspended_at DATE,
  ADD COLUMN internet_updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE room
SET
  internet_service_id = subscription.service_id,
  internet_status = subscription.status,
  internet_activated_at = subscription.activated_at,
  internet_suspended_at = subscription.suspended_at,
  internet_updated_by = subscription.updated_by,
  updated_at = CURRENT_TIMESTAMP
FROM room_internet_subscription AS subscription
WHERE subscription.room_id = room.id;

ALTER TABLE room
  ADD CONSTRAINT room_internet_dates_valid CHECK (
    internet_suspended_at IS NULL
    OR internet_activated_at IS NULL
    OR internet_suspended_at >= internet_activated_at
  );

CREATE INDEX room_internet_service_status_index
  ON room(internet_service_id, internet_status);

ALTER TABLE application
  ADD COLUMN disciplinary_basis JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE application
SET disciplinary_basis = basis.items
FROM (
  SELECT
    application_id,
    jsonb_agg(
      jsonb_build_object('disciplinaryRecordId', disciplinary_record_id)
      ORDER BY disciplinary_record_id
    ) AS items
  FROM eviction_disciplinary_basis
  GROUP BY application_id
) AS basis
WHERE basis.application_id = application.id;

DROP TABLE IF EXISTS eviction_disciplinary_basis;
DROP TABLE IF EXISTS room_internet_subscription;
DROP TABLE IF EXISTS notification_job_run;
DROP TABLE IF EXISTS billing_job_run;
DROP TABLE IF EXISTS disciplinary_policy;

COMMIT;

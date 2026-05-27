BEGIN;

ALTER TABLE service
  ADD COLUMN IF NOT EXISTS payment_due_day INTEGER NOT NULL DEFAULT 10
    CHECK (payment_due_day BETWEEN 1 AND 28);

CREATE TABLE accommodation_billing_period (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  charge_date DATE NOT NULL,
  due_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT accommodation_billing_period_dates_valid CHECK (
    period_end >= period_start
    AND charge_date <= period_end
    AND due_date >= charge_date
  ),
  CONSTRAINT accommodation_billing_period_unique UNIQUE
    (service_id, period_start, period_end)
);

CREATE INDEX accommodation_billing_period_schedule_index
  ON accommodation_billing_period(active, charge_date, period_end);

CREATE TABLE billing_job_run (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(80) NOT NULL,
  business_date DATE NOT NULL,
  internet_created_count INTEGER NOT NULL DEFAULT 0,
  accommodation_created_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT billing_job_daily_unique UNIQUE (job_name, business_date)
);

COMMIT;

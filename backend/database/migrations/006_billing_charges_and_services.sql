BEGIN;

CREATE TYPE billing_frequency AS ENUM ('once', 'monthly', 'semester');
CREATE TYPE charge_status AS ENUM ('pending', 'paid', 'cancelled', 'overdue', 'waived');
CREATE TYPE charge_subject_type AS ENUM ('residence', 'room');

ALTER TABLE service
  ADD COLUMN service_code VARCHAR(40) UNIQUE,
  ADD COLUMN billing_frequency billing_frequency NOT NULL DEFAULT 'once',
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE billing_charge (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  subject_type charge_subject_type NOT NULL,
  residence_id BIGINT REFERENCES residence(id) ON DELETE RESTRICT,
  room_id BIGINT REFERENCES room(id) ON DELETE RESTRICT,
  responsible_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status charge_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT billing_charge_period_valid CHECK (period_end >= period_start),
  CONSTRAINT billing_charge_subject_valid CHECK (
    (subject_type = 'residence' AND residence_id IS NOT NULL AND room_id IS NULL)
    OR
    (subject_type = 'room' AND room_id IS NOT NULL AND residence_id IS NULL)
  )
);

CREATE UNIQUE INDEX billing_charge_unique_period_subject
  ON billing_charge(
    service_id,
    subject_type,
    COALESCE(residence_id, 0),
    COALESCE(room_id, 0),
    period_start,
    period_end
  );

CREATE INDEX billing_charge_due_status_index
  ON billing_charge(status, due_date);

ALTER TABLE transactions
  ADD COLUMN charge_id BIGINT REFERENCES billing_charge(id) ON DELETE SET NULL;

CREATE INDEX transactions_charge_index ON transactions(charge_id);

CREATE UNIQUE INDEX transactions_one_success_per_charge
  ON transactions(charge_id)
  WHERE charge_id IS NOT NULL AND payment_status = 'succeeded';

COMMIT;

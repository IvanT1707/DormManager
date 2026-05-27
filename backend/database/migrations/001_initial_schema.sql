BEGIN;

CREATE TYPE user_role AS ENUM (
  'student',
  'commandant',
  'maintenance_staff',
  'administrator'
);

CREATE TYPE residence_status AS ENUM ('active', 'archived');

CREATE TYPE application_type AS ENUM (
  'settlement',
  'renewal',
  'repair',
  'eviction',
  'relocation'
);

CREATE TYPE application_status AS ENUM (
  'pending',
  'in_review',
  'approved',
  'rejected',
  'completed',
  'cancelled'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'succeeded',
  'failed',
  'refunded'
);

CREATE TABLE dorm (
  id BIGSERIAL PRIMARY KEY,
  dorm_number VARCHAR(20) NOT NULL UNIQUE,
  address VARCHAR(255) NOT NULL,
  total_floors INTEGER CHECK (total_floors > 0),
  residential_floor_from INTEGER CHECK (residential_floor_from > 0),
  has_blocks BOOLEAN NOT NULL DEFAULT TRUE,
  blocks_per_floor INTEGER CHECK (blocks_per_floor > 0),
  rooms_per_block INTEGER CHECK (rooms_per_block > 0),
  rooms_per_floor INTEGER CHECK (rooms_per_floor > 0),
  default_room_capacity INTEGER CHECK (default_room_capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dorm_residential_floor_valid CHECK (
    total_floors IS NULL OR residential_floor_from IS NULL OR residential_floor_from <= total_floors
  )
);

CREATE TABLE room (
  id BIGSERIAL PRIMARY KEY,
  dorm_id BIGINT NOT NULL REFERENCES dorm(id) ON DELETE CASCADE,
  room_number VARCHAR(20) NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  floor_number INTEGER CHECK (floor_number > 0),
  block_number INTEGER CHECK (block_number > 0),
  room_in_block INTEGER CHECK (room_in_block > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_dorm_number_unique UNIQUE (dorm_id, room_number)
);

CREATE UNIQUE INDEX room_dorm_layout_unique
  ON room(dorm_id, floor_number, block_number, room_in_block)
  WHERE floor_number IS NOT NULL AND block_number IS NOT NULL AND room_in_block IS NOT NULL;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  firebase_uid VARCHAR(128) UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  role user_role NOT NULL DEFAULT 'student',
  full_name VARCHAR(255) NOT NULL,
  faculty VARCHAR(255),
  specialty VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE service (
  id BIGSERIAL PRIMARY KEY,
  service_type VARCHAR(100) NOT NULL UNIQUE,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  payment_due_day INTEGER NOT NULL DEFAULT 10 CHECK (payment_due_day BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE residence (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  room_id BIGINT NOT NULL REFERENCES room(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE,
  status residence_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT residence_dates_valid CHECK (
    end_date IS NULL OR end_date >= start_date
  ),
  CONSTRAINT archived_residence_has_end_date CHECK (
    status <> 'archived' OR end_date IS NOT NULL
  )
);

CREATE UNIQUE INDEX residence_one_active_room_per_user
  ON residence(user_id)
  WHERE status = 'active';

CREATE INDEX residence_active_room_index
  ON residence(room_id)
  WHERE status = 'active';

CREATE TABLE application (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id BIGINT REFERENCES room(id) ON DELETE SET NULL,
  assigned_room_id BIGINT REFERENCES room(id) ON DELETE SET NULL,
  application_type application_type NOT NULL,
  status application_status NOT NULL DEFAULT 'pending',
  description TEXT,
  resolution_note TEXT,
  eligibility_verified BOOLEAN NOT NULL DEFAULT FALSE,
  documents_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payment_verified BOOLEAN NOT NULL DEFAULT FALSE,
  medical_clearance_verified BOOLEAN NOT NULL DEFAULT FALSE,
  safety_briefing_completed BOOLEAN NOT NULL DEFAULT FALSE,
  pass_issued BOOLEAN NOT NULL DEFAULT FALSE,
  housing_conditions_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX application_user_status_index ON application(user_id, status);
CREATE INDEX application_type_status_index ON application(application_type, status);
CREATE INDEX application_assigned_room_index ON application(assigned_room_id);

CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  payment_status payment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX transactions_user_status_index
  ON transactions(user_id, payment_status);

COMMIT;

BEGIN;

CREATE TYPE disciplinary_record_type AS ENUM ('formal_warning', 'violation');
CREATE TYPE disciplinary_record_status AS ENUM ('active', 'resolved', 'revoked');

CREATE TABLE disciplinary_record (
  id BIGSERIAL PRIMARY KEY,
  residence_id BIGINT NOT NULL REFERENCES residence(id) ON DELETE RESTRICT,
  issued_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  record_type disciplinary_record_type NOT NULL,
  status disciplinary_record_status NOT NULL DEFAULT 'active',
  incident_date DATE NOT NULL,
  rule_reference VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  resolution_note TEXT,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX disciplinary_residence_status_index
  ON disciplinary_record(residence_id, status, incident_date DESC);

CREATE TABLE eviction_disciplinary_basis (
  application_id BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  disciplinary_record_id BIGINT NOT NULL REFERENCES disciplinary_record(id) ON DELETE RESTRICT,
  PRIMARY KEY (application_id, disciplinary_record_id)
);

COMMIT;

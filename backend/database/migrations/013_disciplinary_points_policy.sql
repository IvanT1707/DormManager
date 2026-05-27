BEGIN;

CREATE TABLE violation_rule (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  record_type disciplinary_record_type NOT NULL,
  rule_reference VARCHAR(255) NOT NULL,
  default_points INTEGER NOT NULL CHECK (default_points BETWEEN 0 AND 35),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE disciplinary_policy (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  no_renewal_threshold INTEGER NOT NULL CHECK (no_renewal_threshold BETWEEN 1 AND 35),
  eviction_threshold INTEGER NOT NULL CHECK (eviction_threshold BETWEEN 1 AND 35),
  max_active_points INTEGER NOT NULL DEFAULT 35 CHECK (max_active_points = 35),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT disciplinary_policy_threshold_order CHECK (
    no_renewal_threshold <= eviction_threshold
    AND eviction_threshold <= max_active_points
  )
);

CREATE UNIQUE INDEX disciplinary_one_active_policy_index
  ON disciplinary_policy(active)
  WHERE active = TRUE;

ALTER TABLE disciplinary_record
  ADD COLUMN violation_rule_id BIGINT REFERENCES violation_rule(id) ON DELETE RESTRICT,
  ADD COLUMN penalty_points INTEGER NOT NULL DEFAULT 0 CHECK (penalty_points BETWEEN 0 AND 35);

INSERT INTO violation_rule (code, title, record_type, rule_reference, default_points)
VALUES
  ('FORMAL_WARNING', 'Офіційне попередження', 'formal_warning', 'Правила внутрішнього розпорядку гуртожитку', 0),
  ('NOISE_AND_ORDER', 'Порушення тиші або порядку', 'violation', 'Правила внутрішнього розпорядку гуртожитку', 5),
  ('SAFETY_VIOLATION', 'Порушення вимог безпеки', 'violation', 'Правила пожежної безпеки та проживання', 10),
  ('PROPERTY_DAMAGE', 'Пошкодження майна', 'violation', 'Правила користування майном гуртожитку', 15),
  ('OTHER_VIOLATION', 'Інше зафіксоване порушення', 'violation', 'Правила внутрішнього розпорядку гуртожитку', 5);

INSERT INTO disciplinary_policy
  (title, no_renewal_threshold, eviction_threshold, max_active_points)
VALUES
  ('Чинна політика дисциплінарного обліку', 25, 35, 35);

UPDATE disciplinary_record AS record
SET
  violation_rule_id = rule.id,
  penalty_points = rule.default_points
FROM violation_rule AS rule
WHERE rule.code = CASE
    WHEN record.record_type = 'formal_warning' THEN 'FORMAL_WARNING'
    ELSE 'OTHER_VIOLATION'
  END;

ALTER TABLE disciplinary_record
  ALTER COLUMN violation_rule_id SET NOT NULL;

CREATE INDEX disciplinary_rule_status_index
  ON disciplinary_record(violation_rule_id, status);

COMMIT;

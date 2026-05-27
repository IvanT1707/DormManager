BEGIN;

CREATE TYPE maintenance_specialization AS ENUM ('general', 'electrician', 'plumber');
CREATE TYPE repair_category AS ENUM ('general', 'electrical', 'plumbing');
CREATE TYPE application_comment_visibility AS ENUM ('public', 'staff');

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'waiting_materials';

ALTER TABLE users
  ADD COLUMN maintenance_specialization maintenance_specialization;

ALTER TABLE application
  ADD COLUMN repair_category repair_category;

UPDATE application
SET repair_category = 'general'
WHERE application_type = 'repair' AND repair_category IS NULL;

CREATE TABLE application_comment (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
  visibility application_comment_visibility NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX application_comment_application_created_index
  ON application_comment(application_id, created_at);

CREATE INDEX application_repair_category_status_index
  ON application(repair_category, status)
  WHERE application_type = 'repair';

COMMIT;

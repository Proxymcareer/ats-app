-- ATS database schema.
-- Applied idempotently by db/migrate.js on every deploy/start.

CREATE TABLE IF NOT EXISTS admins (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  department      TEXT,
  location        TEXT,
  employment_type TEXT DEFAULT 'Full-time',
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidates (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  linkedin_url  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS applications (
  id              SERIAL PRIMARY KEY,
  job_id          INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id    INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  resume_filename TEXT,
  resume_mimetype TEXT,
  resume_data     BYTEA,
  resume_text     TEXT DEFAULT '',
  cover_letter    TEXT DEFAULT '',
  stage           TEXT NOT NULL DEFAULT 'Applied',
  notes           TEXT DEFAULT '',
  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)
);

-- Full text search over resume text + cover letter, kept up to date by a
-- generated column so we never have to remember to maintain it by hand.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(resume_text, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(cover_letter, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS applications_search_idx ON applications USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS applications_job_idx ON applications (job_id);
CREATE INDEX IF NOT EXISTS applications_stage_idx ON applications (stage);

-- Session store table used by connect-pg-simple. It creates this itself if
-- missing, but declaring it here keeps schema.sql as the single source of truth.
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   json NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

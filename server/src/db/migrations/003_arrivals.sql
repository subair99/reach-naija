-- Verified Arrival jobs and their signed records. No coordinates are stored:
-- only whether the provider's position matched the destination unit.
CREATE TABLE IF NOT EXISTS arrivals (
  id          TEXT PRIMARY KEY,
  status      TEXT        NOT NULL,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arrivals_status_idx ON arrivals (status, created_at DESC);

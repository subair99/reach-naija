-- Address Cards. Card data is kept as JSONB in the PostcodeSelection-v1-plus shape.
CREATE EXTENSION IF NOT EXISTS postgis;  -- not used by the demo yet; ready for coverage queries

CREATE TABLE IF NOT EXISTS address_cards (
  id          TEXT PRIMARY KEY,
  owner_hash  TEXT,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS address_cards_owner_idx ON address_cards (owner_hash, created_at DESC);

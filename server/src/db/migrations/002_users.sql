-- Users are identified only by a keyed hash of their phone number.
CREATE TABLE IF NOT EXISTS saved_postcodes (
  owner_hash  TEXT        NOT NULL,
  postcode    TEXT        NOT NULL,
  card_id     TEXT        NOT NULL REFERENCES address_cards(id) ON DELETE CASCADE,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_hash, postcode)
);

CREATE TABLE IF NOT EXISTS user_prefs (
  owner_hash  TEXT PRIMARY KEY,
  lang        TEXT NOT NULL DEFAULT 'en'
);

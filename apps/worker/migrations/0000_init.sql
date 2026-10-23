-- Elder Realms Online: initial schema (vertical slice). Mirrors src/db/schema.ts.
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,                       -- Supabase auth.users.id (no cross-database FK by design)
  role text NOT NULL DEFAULT 'player',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  slot integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  x real NOT NULL,
  y real NOT NULL,
  hp integer NOT NULL CHECK (hp > 0),
  coins bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  farm_rows integer NOT NULL DEFAULT 2 CHECK (farm_rows BETWEEN 1 AND 16),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, slot)
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_name_lower_uq ON characters (lower(name));

CREATE TABLE IF NOT EXISTS character_skills (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  skill text NOT NULL,
  xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  PRIMARY KEY (character_id, skill)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot >= 0),
  item_id text NOT NULL,
  qty bigint NOT NULL CHECK (qty > 0),
  PRIMARY KEY (character_id, slot)
);

CREATE TABLE IF NOT EXISTS farm_plots (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  x integer NOT NULL,
  y integer NOT NULL,
  state text NOT NULL CHECK (state IN ('tilled', 'planted')),
  crop_id text,
  planted_at bigint,                          -- server epoch milliseconds
  PRIMARY KEY (character_id, x, y),
  CHECK ((state = 'planted') = (crop_id IS NOT NULL AND planted_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS quest_progress (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  quest_id text NOT NULL,
  step integer NOT NULL DEFAULT 0,
  progress integer NOT NULL DEFAULT 0,
  done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, quest_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  account_id uuid,
  character_id uuid,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_account_idx ON audit_log (account_id, at DESC);

-- Allow character cards to use tier D consistently with tier-list rows.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS characters_next (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'S',
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  attribute TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'A' CHECK (tier IN ('S+', 'S', 'A', 'B', 'C', 'D')),
  premium_tier TEXT NOT NULL DEFAULT 'A' CHECK (premium_tier IN ('S+', 'S', 'A', 'B', 'C', 'D')),
  tier_rank INTEGER NOT NULL DEFAULT 30,
  image_url TEXT NOT NULL,
  splash_url TEXT,
  short_description TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  patch_version TEXT NOT NULL DEFAULT '1.0',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO characters_next (
  id,
  slug,
  name,
  original_name,
  rarity,
  role,
  type,
  attribute,
  tier,
  premium_tier,
  tier_rank,
  image_url,
  splash_url,
  short_description,
  summary,
  tags_json,
  status,
  patch_version,
  created_at,
  updated_at
)
SELECT
  id,
  slug,
  name,
  original_name,
  rarity,
  role,
  type,
  attribute,
  tier,
  premium_tier,
  tier_rank,
  image_url,
  splash_url,
  short_description,
  summary,
  tags_json,
  status,
  patch_version,
  created_at,
  updated_at
FROM characters;

DROP TABLE characters;
ALTER TABLE characters_next RENAME TO characters;

CREATE INDEX IF NOT EXISTS idx_characters_filters
  ON characters(tier, role, type, attribute, rarity);

PRAGMA foreign_keys = ON;

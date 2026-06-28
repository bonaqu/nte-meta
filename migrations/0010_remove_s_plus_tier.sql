-- Product tier model uses only S, A, B, C, D. Legacy S+ values become S.

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
  tier TEXT NOT NULL DEFAULT 'A' CHECK (tier IN ('S', 'A', 'B', 'C', 'D')),
  premium_tier TEXT NOT NULL DEFAULT 'A' CHECK (premium_tier IN ('S', 'A', 'B', 'C', 'D')),
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
  CASE tier WHEN 'S+' THEN 'S' ELSE tier END,
  CASE premium_tier WHEN 'S+' THEN 'S' ELSE premium_tier END,
  CASE
    WHEN CASE tier WHEN 'S+' THEN 'S' ELSE tier END = 'S' THEN 10
    WHEN tier = 'A' THEN 20
    WHEN tier = 'B' THEN 30
    WHEN tier = 'C' THEN 40
    WHEN tier = 'D' THEN 50
    ELSE tier_rank
  END,
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

CREATE TABLE IF NOT EXISTS tierlist_items_next (
  tierlist_id TEXT NOT NULL REFERENCES tierlists(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C', 'D')),
  tier_rank INTEGER NOT NULL DEFAULT 30,
  position INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (tierlist_id, character_id)
);

INSERT OR IGNORE INTO tierlist_items_next (
  tierlist_id,
  character_id,
  tier,
  tier_rank,
  position,
  note
)
SELECT
  tierlist_id,
  character_id,
  CASE tier WHEN 'S+' THEN 'S' ELSE tier END,
  CASE
    WHEN CASE tier WHEN 'S+' THEN 'S' ELSE tier END = 'S' THEN 10
    WHEN tier = 'A' THEN 20
    WHEN tier = 'B' THEN 30
    WHEN tier = 'C' THEN 40
    WHEN tier = 'D' THEN 50
    ELSE tier_rank
  END,
  position,
  note
FROM tierlist_items;

DROP TABLE tierlist_items;
ALTER TABLE tierlist_items_next RENAME TO tierlist_items;

CREATE INDEX IF NOT EXISTS idx_tierlist_items_tier
  ON tierlist_items(tierlist_id, tier, position);

-- Some early demo databases had empty seed tier-list rows. Backfill only the
-- built-in public tier-lists and only when editors have not created rows yet.
INSERT OR IGNORE INTO tierlist_items (
  tierlist_id,
  character_id,
  tier,
  tier_rank,
  position,
  note
)
SELECT
  ranked.tierlist_id,
  ranked.character_id,
  ranked.tier,
  ranked.tier_rank,
  ranked.position,
  ranked.note
FROM (
  SELECT
    tierlists.id AS tierlist_id,
    characters.id AS character_id,
    CASE tierlists.tierlist_type
      WHEN 'premium' THEN characters.premium_tier
      ELSE characters.tier
    END AS tier,
    CASE
      WHEN CASE tierlists.tierlist_type
        WHEN 'premium' THEN characters.premium_tier
        ELSE characters.tier
      END = 'S' THEN 10
      WHEN CASE tierlists.tierlist_type
        WHEN 'premium' THEN characters.premium_tier
        ELSE characters.tier
      END = 'A' THEN 20
      WHEN CASE tierlists.tierlist_type
        WHEN 'premium' THEN characters.premium_tier
        ELSE characters.tier
      END = 'B' THEN 30
      WHEN CASE tierlists.tierlist_type
        WHEN 'premium' THEN characters.premium_tier
        ELSE characters.tier
      END = 'C' THEN 40
      ELSE 50
    END AS tier_rank,
    ROW_NUMBER() OVER (
      PARTITION BY tierlists.id
      ORDER BY
        CASE
          WHEN CASE tierlists.tierlist_type
            WHEN 'premium' THEN characters.premium_tier
            ELSE characters.tier
          END = 'S' THEN 10
          WHEN CASE tierlists.tierlist_type
            WHEN 'premium' THEN characters.premium_tier
            ELSE characters.tier
          END = 'A' THEN 20
          WHEN CASE tierlists.tierlist_type
            WHEN 'premium' THEN characters.premium_tier
            ELSE characters.tier
          END = 'B' THEN 30
          WHEN CASE tierlists.tierlist_type
            WHEN 'premium' THEN characters.premium_tier
            ELSE characters.tier
          END = 'C' THEN 40
          ELSE 50
        END,
        characters.name
    ) AS position,
    CASE tierlists.tierlist_type
      WHEN 'premium' THEN 'Оценка предполагает высокий уровень вложений и оптимальные команды'
      ELSE 'Редакционная оценка NTE Meta'
    END AS note
  FROM tierlists
  CROSS JOIN characters
  WHERE tierlists.id IN ('tier-base-10', 'tier-premium-10')
    AND NOT EXISTS (
      SELECT 1
      FROM tierlist_items existing_items
      WHERE existing_items.tierlist_id = tierlists.id
    )
) ranked;

PRAGMA foreign_keys = ON;

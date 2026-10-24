-- Keep variant-specific wardrobe and voice data separate from shared mechanics.
CREATE TABLE IF NOT EXISTS character_appearance_variants (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  skins_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(skins_json)),
  voice_lines_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(voice_lines_json)),
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (character_id, variant_id)
);

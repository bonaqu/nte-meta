ALTER TABLE character_appearance_variants
ADD COLUMN base_stats_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(base_stats_json));

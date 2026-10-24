ALTER TABLE character_appearance_variants
ADD COLUMN abilities_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(abilities_json));

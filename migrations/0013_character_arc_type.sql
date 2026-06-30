-- Character profile arc type belongs to lore/profile data, not guide meta.
ALTER TABLE character_profiles ADD COLUMN arc_type TEXT NOT NULL DEFAULT '';


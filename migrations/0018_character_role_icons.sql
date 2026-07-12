-- Keep role labels stable for filters while storing optional visual metadata.
ALTER TABLE character_profiles
ADD COLUMN role_icons_json TEXT NOT NULL DEFAULT '[]';

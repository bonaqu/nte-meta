PRAGMA foreign_keys = ON;

-- Lore-данные персонажа живут отдельно от мета-гайда. JSON-массивы здесь
-- нужны для редактируемых коллекций: навыков, материалов, озвучки и наград.
CREATE TABLE IF NOT EXISTS character_profiles (
  character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  faction TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  biography_short TEXT NOT NULL DEFAULT '',
  biography_markdown TEXT NOT NULL DEFAULT '',
  trivia_markdown TEXT NOT NULL DEFAULT '',
  role_tags_json TEXT NOT NULL DEFAULT '[]',
  voice_actors_json TEXT NOT NULL DEFAULT '[]',
  materials_json TEXT NOT NULL DEFAULT '[]',
  base_stats_json TEXT NOT NULL DEFAULT '[]',
  abilities_json TEXT NOT NULL DEFAULT '[]',
  skins_json TEXT NOT NULL DEFAULT '[]',
  friendship_json TEXT NOT NULL DEFAULT '[]',
  gifts_json TEXT NOT NULL DEFAULT '[]',
  voice_lines_json TEXT NOT NULL DEFAULT '[]',
  awakenings_json TEXT NOT NULL DEFAULT '[]',
  consoles_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO character_profiles (
  character_id,
  biography_short,
  biography_markdown,
  role_tags_json
)
SELECT id, short_description, summary, json_array(role)
FROM characters;

CREATE INDEX IF NOT EXISTS idx_character_profiles_faction
  ON character_profiles(faction);

-- Команда остаётся нормализованной таблицей, но теперь принадлежит гайду и
-- содержит последовательность действий всей пачки, а не отдельного героя.
ALTER TABLE teams ADD COLUMN guide_id TEXT;
ALTER TABLE teams ADD COLUMN rotation_steps_json TEXT NOT NULL DEFAULT '[]';

UPDATE teams
SET guide_id = (
  SELECT guides.id
  FROM guides
  JOIN team_members ON team_members.character_id = guides.character_id
  WHERE team_members.team_id = teams.id
  ORDER BY guides.updated_at DESC
  LIMIT 1
)
WHERE guide_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_teams_guide
  ON teams(guide_id, status, updated_at);

-- Роль editor одна, а грейд и точные возможности задаются отдельно.
CREATE TABLE IF NOT EXISTS editor_permissions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade TEXT NOT NULL DEFAULT 'junior'
    CHECK (grade IN ('junior', 'editor', 'senior', 'lead')),
  scopes_json TEXT NOT NULL DEFAULT '["guides","characters"]',
  can_create INTEGER NOT NULL DEFAULT 1,
  can_edit INTEGER NOT NULL DEFAULT 1,
  can_publish INTEGER NOT NULL DEFAULT 1,
  can_delete INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO editor_permissions (user_id)
SELECT id FROM users WHERE role = 'editor';

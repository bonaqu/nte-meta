PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 180000,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'admin', 'moderator', 'editor', 'user')),
  avatar_url TEXT,
  bio TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'S',
  role TEXT NOT NULL,
  type TEXT NOT NULL,
  attribute TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'A' CHECK (tier IN ('S+', 'S', 'A', 'B', 'C')),
  premium_tier TEXT NOT NULL DEFAULT 'A' CHECK (premium_tier IN ('S+', 'S', 'A', 'B', 'C')),
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

CREATE TABLE IF NOT EXISTS guides (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  patch_version TEXT NOT NULL DEFAULT '1.0',
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'NTE Meta',
  video_url TEXT,
  transcript_markdown TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guide_sections (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  section_type TEXT NOT NULL DEFAULT 'custom',
  content_markdown TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rotations (
  id TEXT PRIMARY KEY,
  guide_id TEXT REFERENCES guides(id) ON DELETE SET NULL,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rotation_type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]',
  logic TEXT NOT NULL,
  media_url TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  team_type TEXT NOT NULL,
  budget TEXT NOT NULL CHECK (budget IN ('F2P', 'Premium', 'Mixed')),
  difficulty TEXT NOT NULL,
  power INTEGER NOT NULL DEFAULT 0,
  good_at TEXT NOT NULL,
  weak_at TEXT NOT NULL,
  synergy TEXT NOT NULL,
  rotation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, character_id)
);

CREATE TABLE IF NOT EXISTS tierlists (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  tierlist_type TEXT NOT NULL CHECK (tierlist_type IN ('base', 'premium')),
  patch_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  changelog_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tierlist_items (
  tierlist_id TEXT NOT NULL REFERENCES tierlists(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S+', 'S', 'A', 'B', 'C')),
  tier_rank INTEGER NOT NULL DEFAULT 30,
  position INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (tierlist_id, character_id)
);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'NTE Meta',
  category TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  image_url TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  body_markdown TEXT NOT NULL,
  original_post_url TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT,
  trust_level TEXT NOT NULL DEFAULT 'низкий' CHECK (trust_level IN ('низкий', 'средний', 'высокий')),
  leak_status TEXT NOT NULL DEFAULT 'слух' CHECK (leak_status IN ('слух', 'слив', 'подтверждено', 'опровергнуто')),
  approved INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'edited', 'deleted', 'moderated')),
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'dislike', 'useful')),
  value INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, target_type, target_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('telegram', 'website', 'youtube', 'twitter/x', 'manual')),
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  trust_level TEXT NOT NULL DEFAULT 'средний' CHECK (trust_level IN ('низкий', 'средний', 'высокий')),
  auto_import_enabled INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_characters_slug ON characters(slug);
CREATE INDEX IF NOT EXISTS idx_characters_filters ON characters(tier, role, type, attribute, rarity);
CREATE INDEX IF NOT EXISTS idx_guides_character_status ON guides(character_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_guide_sections_order ON guide_sections(guide_id, position);
CREATE INDEX IF NOT EXISTS idx_rotations_character ON rotations(character_id, rotation_type);
CREATE INDEX IF NOT EXISTS idx_team_members_character ON team_members(character_id);
CREATE INDEX IF NOT EXISTS idx_tierlist_items_tier ON tierlist_items(tierlist_id, tier_rank, position);
CREATE INDEX IF NOT EXISTS idx_news_status_date ON news(status, created_at);
CREATE INDEX IF NOT EXISTS idx_leaks_public ON leaks(approved, leak_status, trust_level, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id, reaction_type);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sources_import ON sources(auto_import_enabled, source_type, last_checked_at);

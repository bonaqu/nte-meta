-- Editorial queue for public leak discovery and user submissions.

CREATE TABLE IF NOT EXISTS leak_candidates (
  id TEXT PRIMARY KEY,
  external_key TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL CHECK (origin IN ('discovery', 'user')),
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('telegram', 'reddit', 'website', 'bilibili', 'weibo', 'twitter/x', 'manual')),
  language TEXT NOT NULL DEFAULT 'unknown',
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  author_name TEXT,
  published_at TEXT,
  trust_level TEXT NOT NULL DEFAULT 'низкий' CHECK (trust_level IN ('низкий', 'средний', 'высокий')),
  suggested_status TEXT NOT NULL DEFAULT 'слух' CHECK (suggested_status IN ('слух', 'слив', 'подтверждено', 'опровергнуто')),
  confidence_score INTEGER NOT NULL DEFAULT 20 CHECK (confidence_score BETWEEN 0 AND 100),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected', 'duplicate')),
  submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_leak_id TEXT REFERENCES leaks(id) ON DELETE SET NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leak_candidates_review
  ON leak_candidates(review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leak_candidates_source
  ON leak_candidates(source_type, published_at DESC);

INSERT OR IGNORE INTO sources
  (id, source_type, source_url, source_name, trust_level, auto_import_enabled)
VALUES
  ('leaks-ntewiki-news', 'website', 'https://nte.wiki/news/', 'NTE Wiki News', 'средний', 1),
  ('leaks-telegram-loonaly', 'telegram', 'https://t.me/s/loonaly_nte_leaks', 'Loonaly NTE Leaks', 'средний', 1),
  ('leaks-telegram-donut', 'telegram', 'https://t.me/s/donutleaker', 'Donut Leaker (несколько игр)', 'низкий', 0),
  ('leaks-telegram-nte', 'telegram', 'https://t.me/s/NTE_Neverness_to_Everness', 'NTE News & Leaks', 'средний', 1),
  ('leaks-telegram-ru', 'telegram', 'https://t.me/s/neverness_to_evernessru', 'Neverness to Everness RU', 'средний', 1),
  ('leaks-reddit-nteleaks', 'website', 'https://www.reddit.com/r/NTELeaks/new/', 'Reddit r/NTELeaks', 'средний', 0),
  ('leaks-bilibili-search', 'website', 'https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E7%88%86%E6%96%99', 'Bilibili: NTE leaks search', 'низкий', 0),
  ('leaks-official-cn', 'twitter/x', 'https://x.com/NTE_CN', 'NTE China official', 'высокий', 0);

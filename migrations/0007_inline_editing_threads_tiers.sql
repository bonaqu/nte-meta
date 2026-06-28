-- Inline editing phase: community threads and tier D support.

CREATE TABLE IF NOT EXISTS community_threads (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'NTE Meta',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'hidden')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_threads_status
  ON community_threads(status, updated_at);

CREATE TABLE IF NOT EXISTS tierlist_items_next (
  tierlist_id TEXT NOT NULL REFERENCES tierlists(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S+', 'S', 'A', 'B', 'C', 'D')),
  tier_rank INTEGER NOT NULL DEFAULT 30,
  position INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  PRIMARY KEY (tierlist_id, character_id)
);

INSERT OR IGNORE INTO tierlist_items_next
  (tierlist_id, character_id, tier, tier_rank, position, note)
SELECT tierlist_id, character_id, tier, tier_rank, position, note
FROM tierlist_items;

DROP TABLE tierlist_items;
ALTER TABLE tierlist_items_next RENAME TO tierlist_items;

CREATE INDEX IF NOT EXISTS idx_tierlist_items_tier
  ON tierlist_items(tierlist_id, tier, position);

INSERT OR IGNORE INTO community_threads
  (id, slug, title, summary, body_markdown, author_name, status, tags_json, score)
VALUES
  (
    'thread-start-builds',
    'start-builds',
    'Кого качать на старте и где не слить ресурсы',
    'Тред для коротких вопросов по первым вложениям, приоритетам прокачки и ошибкам новичков.',
    'Пишите состав, доступных персонажей и цель. Редакция и игроки помогут выбрать безопасный план без выдуманной меты.',
    'NTE Meta',
    'open',
    '["новички","прокачка","ресурсы"]',
    12
  );

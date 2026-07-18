ALTER TABLE comments ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN is_answer INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_comments_thread_markers
  ON comments(target_type, target_id, is_pinned DESC, is_answer DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_one_thread_answer
  ON comments(target_id)
  WHERE target_type = 'thread' AND is_answer = 1 AND status = 'visible';

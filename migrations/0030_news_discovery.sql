-- Preserve the existing leak relation; news drafts have their own FK.
ALTER TABLE leak_candidates ADD COLUMN created_news_id TEXT REFERENCES news(id) ON DELETE SET NULL;

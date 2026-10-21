-- Immutable local source chunks avoid one database/index write per translated line.
CREATE TABLE IF NOT EXISTS game_source_chunks (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, records_json TEXT NOT NULL CHECK(json_valid(records_json)),
 search_text TEXT NOT NULL, source_hash TEXT NOT NULL, record_count INTEGER NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_chunks_kind ON game_source_chunks(kind);
CREATE VIRTUAL TABLE IF NOT EXISTS game_chunks_fts USING fts5(search_text,content='game_source_chunks',content_rowid='rowid',detail=none,columnsize=0);
CREATE TRIGGER IF NOT EXISTS game_chunks_ai AFTER INSERT ON game_source_chunks BEGIN
 INSERT INTO game_chunks_fts(rowid,search_text) VALUES(new.rowid,new.search_text);
END;
CREATE TRIGGER IF NOT EXISTS game_chunks_ad AFTER DELETE ON game_source_chunks BEGIN
 INSERT INTO game_chunks_fts(game_chunks_fts,rowid,search_text) VALUES('delete',old.rowid,old.search_text);
END;
CREATE TRIGGER IF NOT EXISTS game_chunks_au AFTER UPDATE ON game_source_chunks BEGIN
 INSERT INTO game_chunks_fts(game_chunks_fts,rowid,search_text) VALUES('delete',old.rowid,old.search_text);
 INSERT INTO game_chunks_fts(rowid,search_text) VALUES(new.rowid,new.search_text);
END;
CREATE TABLE IF NOT EXISTS game_record_overrides (
 id TEXT PRIMARY KEY,chunk_id TEXT NOT NULL,overrides_json TEXT NOT NULL CHECK(json_valid(overrides_json)),
 search_text TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_overrides_chunk ON game_record_overrides(chunk_id);
CREATE TABLE IF NOT EXISTS game_import_runs (
 dataset_hash TEXT PRIMARY KEY,status TEXT NOT NULL,record_count INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

"""Check the full snapshot with SQLite before any production import."""
import argparse, gzip, json, re, sqlite3
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--database',type=Path,required=True);args=parser.parse_args()
db=sqlite3.connect(args.database)
db.executescript(Path('migrations/0036_local_game_reference.sql').read_text(encoding='utf-8-sig'))
for name in ['game_chunks_ai','game_chunks_ad','game_chunks_au']:db.execute('DROP TRIGGER IF EXISTS '+name)
sql="""INSERT INTO game_source_chunks(id,kind,records_json,search_text,source_hash,record_count) VALUES(?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,records_json=excluded.records_json,search_text=excluded.search_text,source_hash=excluded.source_hash,record_count=excluded.record_count WHERE game_source_chunks.source_hash<>excluded.source_hash"""
count=0; identifiers=set()
for line in gzip.open('scripts/content/game-data/chunks.jsonl.gz','rt',encoding='utf8'):
 c=json.loads(line)
 for record in c['records']:
  assert record['id'] not in identifiers, 'Duplicate game record: '+record['id']
  identifiers.add(record['id'])
 db.execute(sql,(c['id'],c['kind'],json.dumps(c['records'],ensure_ascii=False,separators=(',',':')),c['search'],c['hash'],c['count']));count+=c['count']
db.commit()
db.execute("INSERT INTO game_chunks_fts(game_chunks_fts) VALUES('rebuild')")
schema=Path('migrations/0036_local_game_reference.sql').read_text(encoding='utf-8-sig')
for trigger in re.findall(r'CREATE TRIGGER IF NOT EXISTS[\s\S]+?END;',schema):db.executescript(trigger)
db.commit()
rows=db.execute("SELECT e.value FROM game_source_chunks c,json_each(c.records_json) e WHERE c.rowid IN (SELECT rowid FROM game_chunks_fts WHERE game_chunks_fts MATCH 'Hathor') AND json_extract(e.value,'$.gameId')='Role_Name_025'").fetchall()
assert len(rows)==1,rows
record=json.loads(rows[0][0]);assert record['values']['ru']=='Хатор';assert record['values']['en']=='Hathor';assert record['values']['ja'];assert record['values']['zh']
assert db.execute('SELECT SUM(record_count) FROM game_source_chunks').fetchone()[0]==count
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print(json.dumps(dict(records=count,chunks=db.execute('SELECT COUNT(*) FROM game_source_chunks').fetchone()[0],sizeBytes=args.database.stat().st_size,sqliteChanges=db.total_changes,hathor=record['values'])))

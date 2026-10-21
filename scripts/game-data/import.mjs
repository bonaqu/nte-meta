import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const chunkImportSql = `INSERT INTO game_source_chunks(id,kind,records_json,search_text,source_hash,record_count)
 VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,records_json=excluded.records_json,
 search_text=excluded.search_text,source_hash=excluded.source_hash,record_count=excluded.record_count,
 updated_at=CURRENT_TIMESTAMP WHERE game_source_chunks.source_hash<>excluded.source_hash`;
export const chunksBatchSql = `INSERT INTO game_source_chunks(id,kind,records_json,search_text,source_hash,record_count)
 SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),json_extract(value,'$.records'),json_extract(value,'$.search'),json_extract(value,'$.hash'),json_extract(value,'$.count')
 FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,records_json=excluded.records_json,
 search_text=excluded.search_text,source_hash=excluded.source_hash,record_count=excluded.record_count,
 updated_at=CURRENT_TIMESTAMP WHERE game_source_chunks.source_hash<>excluded.source_hash`;

// GitHub Actions supplies the existing Cloudflare credentials; no client tokens.
if (process.argv.includes('--remote')) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID,
    token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token)
    throw new Error('Cloudflare credentials are required');
  const bytes = await readFile('scripts/content/game-data/chunks.jsonl.gz');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const manifest = JSON.parse(
    await readFile('scripts/content/game-data/manifest.json', 'utf8'),
  );
  if (hash !== manifest.chunksSha256)
    throw new Error('Dataset checksum mismatch');
  let written = 0,
    read = 0;
  async function query(sql, params = [], maintenance = false) {
    if (!maintenance && written > 30000)
      throw new Error(
        'Import write budget reached; preserved imported chunks and all manual edits. Resume after the daily quota resets.',
      );
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/2fd287de-1361-44e7-89fd-8264cba300dc/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      },
    );
    const payload = await response.json();
    if (!response.ok || !payload.success || !payload.result?.[0]?.success)
      throw new Error(
        'D1 import request failed: ' +
          JSON.stringify(
            payload.errors || payload.result?.[0]?.error || response.status,
          ),
      );
    for (const result of payload.result) {
      written += result.meta?.rows_written || 0;
      read += result.meta?.rows_read || 0;
    }
    return payload.result[0];
  }
  const prior = await query(
    'SELECT status FROM game_import_runs WHERE dataset_hash=?',
    [hash],
  );
  if (prior.results?.[0]?.status === 'complete') {
    console.log('Game reference already imported; no writes.');
    process.exit(0);
  }
  await query(
    "INSERT INTO game_import_runs(dataset_hash,status,record_count) VALUES(?,'running',0) ON CONFLICT(dataset_hash) DO UPDATE SET status='running',updated_at=CURRENT_TIMESTAMP",
    [hash],
  );
  const lines = gunzipSync(bytes).toString('utf8').trim().split('\n');
  let records = 0,
    index = 0;
  let batch = [],
    batchBytes = 2;
  async function flush() {
    if (!batch.length) return;
    await query(chunksBatchSql, ['[' + batch.join(',') + ']']);
    batch = [];
    batchBytes = 2;
  }
  const schema = await readFile(
    'migrations/0036_local_game_reference.sql',
    'utf8',
  );
  const triggers =
    schema.match(/CREATE TRIGGER IF NOT EXISTS[\s\S]+?END;/g) || [];
  if (triggers.length !== 3)
    throw new Error('Unexpected game reference index schema');
  let importError;
  try {
    for (const name of ['game_chunks_ai', 'game_chunks_ad', 'game_chunks_au'])
      await query('DROP TRIGGER IF EXISTS ' + name);
    for (const line of lines) {
      const chunk = JSON.parse(line);
      const size = Buffer.byteLength(line, 'utf8') + 1;
      if (batchBytes + size > 1100000) await flush();
      if (size > 1700000)
        throw new Error('Chunk exceeds the bounded import size');
      batch.push(line);
      batchBytes += size;
      records += chunk.count;
      index++;
      if (index % 100 === 0) {
        await flush();
        console.log(
          JSON.stringify({
            chunks: index,
            totalChunks: lines.length,
            records,
            rowsWritten: written,
            rowsRead: read,
          }),
        );
      }
    }
    await flush();
    if (records !== manifest.records) throw new Error('Record count mismatch');
  } catch(error) { importError=error; } finally {
    // Rebuild once rather than writing thousands of intermediate FTS segments.
    // Restore index maintenance even when an import is interrupted or fails.
    let repairError;
    try {
      await query(
        "INSERT INTO game_chunks_fts(game_chunks_fts) VALUES('rebuild')",
        [],
        true,
      );
    } catch (error) {
      repairError = error;
    }
    for (const trigger of triggers) {
      try {
        await query(trigger, [], true);
      } catch (error) {
        repairError ||= error;
      }
    }
    if (repairError) importError=importError?new AggregateError([importError,repairError],'Import/index repair failed'):repairError;
  }
  if(importError)throw importError;
  await query(
    "UPDATE game_import_runs SET status='complete',record_count=?,updated_at=CURRENT_TIMESTAMP WHERE dataset_hash=?",
    [records, hash],
    true,
  );
  console.log(
    JSON.stringify({
      complete: true,
      records,
      chunks: lines.length,
      rowsWritten: written,
      rowsRead: read,
    }),
  );
}

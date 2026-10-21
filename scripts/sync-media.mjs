import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

// Only public editorial images are exported. Never export user/session records.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare credentials are required');
const database = '2fd287de-1361-44e7-89fd-8264cba300dc';
const root = path.resolve('public/uploads');
let cursor = '';
const files = [];
for (;;) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sql: 'SELECT id,path,mime_type,data_base64,byte_length FROM media_uploads WHERE id > ? ORDER BY id LIMIT 3',
        params: [cursor],
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.success || !payload.result?.[0]?.success)
    throw new Error('Failed to read editorial media from D1');
  const rows = payload.result[0].results;
  if (!rows.length) break;
  for (const row of rows) {
    if (
      !/^public\/uploads\/[a-zA-Z0-9_/-]+\/[a-f0-9]{64}\.(?:png|jpg|webp)$/.test(
        row.path,
      )
    )
      throw new Error('Invalid media path');
    const target = path.resolve(row.path);
    if (!target.startsWith(root + path.sep))
      throw new Error('Media path escapes output directory');
    const bytes = Buffer.from(row.data_base64, 'base64');
    if (bytes.length !== row.byte_length || bytes.length > 675000)
      throw new Error('Invalid media size');
    await mkdir(path.dirname(target), { recursive: true });
    let current;
    try {
      current = await readFile(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!current || !current.equals(bytes)) await writeFile(target, bytes);
    files.push({
      id: row.id,
      path: row.path.slice(7),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    cursor = row.id;
  }
}
await mkdir(root, { recursive: true });
await writeFile(
  path.join(root, 'index.json'),
  JSON.stringify({ files }, null, 2) + '\n',
);
console.log(`Synchronized ${files.length} public editorial images.`);

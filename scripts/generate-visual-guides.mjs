import { readFile, writeFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const code = await readFile('src/worker.js', 'utf8');
const c = vm.createContext({ URL });
new vm.Script(
  code.replace('export default {', 'const worker = {') +
    '\nglobalThis.sources=LEAK_DISCOVERY_SOURCES;',
).runInContext(c);
const sourceSql = [
  '-- Extend the reviewed registry; preserve existing editorial switches and trust.',
];
for (const s of c.sources) {
  sourceSql.push(
    `INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT ${[`discovery-${s.id}`, s.type === 'telegram' ? 'telegram' : 'website', s.name, s.url, s.trustLevel].map(quote).join(',')},${s.referenceOnly ? 0 : 1},${[s.language || 'unknown', s.official ? 'news' : s.relevance === 'future' ? 'leak' : 'news', s.parser || ''].map(quote).join(',')} WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url=${quote(s.url)});`,
  );
  sourceSql.push(
    `UPDATE sources SET language=${quote(s.language || 'unknown')},content_kind=${quote(s.official ? 'news' : s.relevance === 'future' ? 'leak' : 'news')},parser=${quote(s.parser || '')} WHERE source_url=${quote(s.url)} AND language='unknown' AND parser='';`,
  );
}
sourceSql.push(
  `-- Remove only the known malformed imported ability, preserving every other row.\nUPDATE character_profiles SET abilities_json=(SELECT json_group_array(json(value)) FROM json_each(character_profiles.abilities_json) WHERE instr(COALESCE(json_extract(value,'$.name'),''),'Оставшееся время действия Реморы рассчитывается для каждой цели индивидуально.')<>1) WHERE json_valid(abilities_json) AND EXISTS (SELECT 1 FROM json_each(character_profiles.abilities_json) WHERE instr(COALESCE(json_extract(value,'$.name'),''),'Оставшееся время действия Реморы рассчитывается для каждой цели индивидуально.')=1);`,
);
await writeFile(
  'migrations/0034_sources_and_import_repair.sql',
  sourceSql.join('\n\n') + '\n',
);
const reviewed = JSON.parse(
  await readFile('scripts/content/visual-guides-2026-10-21.json', 'utf8'),
);
for (const g of reviewed.guides)
  for (const item of g.sections.arcs.items) {
    if (item.name === 'Clear Skies')
      item.description =
        'Увеличивает урон Анимы навыка перенаправления и сверхспособности на 20%.';
    if (item.name === 'Fluff of Fleetness')
      item.description =
        'На поле получает по 5% атаки каждую секунду, до пяти стаков. После ухода с поля стаки сбрасываются.';
  }
await writeFile(
  'scripts/content/visual-guides-2026-10-21.json',
  JSON.stringify(reviewed, null, 2) + '\n',
);
const lines = [
  '-- Reviewed visual guide sections. Exact legacy-text guards preserve authored edits.',
  '-- No tier assignments, user content, or publication states are changed.',
  'CREATE TABLE visual_guides_0035 (id TEXT PRIMARY KEY);',
];
const guards = [];
const emitted = new Set();
const push = (sql) => {
  if (!emitted.has(sql)) {
    emitted.add(sql);
    lines.push(sql);
  }
};
const files = (await readdir('migrations'))
  .filter((f) => f.endsWith('.sql') && f < '0035')
  .sort();
for (const production of [false, true]) {
  const db = new DatabaseSync(':memory:');
  for (const file of files) {
    if (file.startsWith('0029') && production) {
      const { guide } = JSON.parse(
        await readFile('tests/fixtures/hotori-public-before.json', 'utf8'),
      );
      db.prepare('DELETE FROM guide_sections WHERE guide_id=?').run(guide.id);
      for (const s of guide.sections)
        db.prepare(
          'INSERT INTO guide_sections (id,guide_id,title,section_type,content_markdown,position) VALUES (?,?,?,?,?,?)',
        ).run(s.id, guide.id, s.title, s.type, s.content, s.position);
    }
    db.exec(
      (await readFile('migrations/' + file, 'utf8')).replaceAll('\r\n', '\n'),
    );
  }
  for (const g of reviewed.guides) {
    const guide = db
      .prepare(
        'SELECT guides.id FROM guides JOIN characters ON characters.id=guides.character_id WHERE characters.slug=?',
      )
      .get(g.slug);
    if (!guide) continue;
    const sections = db
      .prepare(
        'SELECT * FROM guide_sections WHERE guide_id=? ORDER BY position',
      )
      .all(guide.id);
    const build = sections.find((s) =>
      ['build', 'builds'].includes(s.section_type),
    );
    if (!build) continue;
    const exact = (s) =>
      `id=${quote(s.id)} AND replace(content_markdown,char(13),'')=${quote(s.content_markdown.replaceAll('\r', ''))} AND json_extract(meta_json,'$.visual') IS NULL`;
    guards.push(
      `INSERT OR IGNORE INTO visual_guides_0035 SELECT ${quote(guide.id)} WHERE EXISTS (SELECT 1 FROM guide_sections WHERE ${exact(build)});`,
    );
    for (const [kind, section] of Object.entries(g.sections)) {
      const type = {
        arcs: 'best-arcs',
        cartridges: 'cartridges',
        stats: 'main-stats',
        skills: 'skill-priority',
      }[kind];
      const title = {
        arcs: 'Лучшие дуги',
        cartridges: 'Лучшие картриджи',
        stats: 'Основные статы',
        skills: 'Приоритет прокачки навыков',
      }[kind];
      const prior = sections.find((s) => s.section_type === type);
      if (prior) {
        push(
          `UPDATE guide_sections SET title=${quote(title)},meta_json=json_set(meta_json,'$.visual',json(${quote(JSON.stringify(section))}),'$.legacyMarkdown',content_markdown),content_markdown='',updated_at=CURRENT_TIMESTAMP WHERE ${exact(prior)};`,
        );
      } else {
        push(
          `INSERT OR IGNORE INTO guide_sections (id,guide_id,title,section_type,content_markdown,position,meta_json) SELECT ${[`${g.slug}-${kind}-0035`, guide.id, title, type, ''].map(quote).join(',')},${{ arcs: 4, cartridges: 5, stats: 6, skills: 7 }[kind]},${quote(JSON.stringify({ visual: section, reviewedAt: reviewed.checkedAt }))} WHERE EXISTS (SELECT 1 FROM visual_guides_0035 WHERE id=${quote(guide.id)}) AND NOT EXISTS (SELECT 1 FROM guide_sections WHERE guide_id=${quote(guide.id)} AND section_type=${quote(type)});`,
        );
      }
    }
    // Retain the combined legacy section for editors only.
    push(
      `UPDATE guide_sections SET section_type='sources',title='Архив сборки',updated_at=CURRENT_TIMESTAMP WHERE ${exact(build)} AND EXISTS (SELECT 1 FROM visual_guides_0035 WHERE id=${quote(guide.id)});`,
    );
    const rotation = sections.find((s) =>
      ['rotation', 'rotations'].includes(s.section_type),
    );
    if (rotation) {
      const steps = rotation.content_markdown
        .split(/\r?\n/)
        .map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
        .filter(Boolean);
      const visual = {
        kind: 'rotation',
        items: steps.map((description, i) => ({
          id: `${g.slug}-rotation-${i + 1}`,
          name: `Шаг ${i + 1}`,
          description,
          imageUrl: '',
          stats: [],
        })),
      };
      push(
        `UPDATE guide_sections SET title='Базовая ротация',meta_json=json_set(meta_json,'$.visual',json(${quote(JSON.stringify(visual))}),'$.legacyMarkdown',content_markdown),content_markdown='',updated_at=CURRENT_TIMESTAMP WHERE ${exact(rotation)};`,
      );
    }
    for (const tips of sections.filter((s) =>
      ['mistakes', 'tips', 'mechanics'].includes(s.section_type),
    )) {
      let text = tips.content_markdown;
      if (g.slug === 'akane')
        text = text.replace(
          ' Не переносите оценки других персонажей на Аканэ: её место в едином тир-листе пока не задано.',
          '',
        );
      push(
        `UPDATE guide_sections SET title='Советы и частые ошибки',content_markdown=${quote(text)},updated_at=CURRENT_TIMESTAMP WHERE ${exact(tips)};`,
      );
    }
  }
  db.close();
}
lines.splice(3, 0, ...guards);
lines.push('DROP TABLE visual_guides_0035;');
await writeFile('migrations/0035_visual_guides.sql', lines.join('\n\n') + '\n');

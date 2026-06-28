-- Remove visible demo/placeholder wording from public editorial content.

UPDATE leaks
SET
  source_name = 'Источник требует редакционной проверки',
  source_url = NULL
WHERE source_name = 'Telegram source placeholder'
  AND source_url = 'https://t.me/example';

UPDATE leaks
SET source_name = 'Очередь источников NTE Meta'
WHERE source_name = 'Source queue demo';

UPDATE sources
SET
  source_url = 'https://bonaqu.github.io/nte-meta/'
WHERE id = 'source-manual'
  AND source_url = 'https://nte-meta.local/manual';

UPDATE sources
SET
  id = 'source-editorial-queue',
  source_name = 'Очередь источников NTE Meta',
  source_url = 'https://bonaqu.github.io/nte-meta/'
WHERE id = 'source-telegram-demo'
  AND source_name = 'Telegram leaks source placeholder'
  AND source_url = 'https://t.me/example';

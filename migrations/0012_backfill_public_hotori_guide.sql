-- Backfill the minimum public guide required for a production portal.
-- The guide is intentionally marked as requiring editorial verification instead
-- of presenting unverified gameplay data as final meta.

INSERT INTO guides (
  id,
  slug,
  character_id,
  title,
  summary,
  status,
  patch_version,
  author_name,
  video_url,
  transcript_markdown
)
SELECT
  'guide-hotori',
  'hotori-burst-guide',
  'hotori',
  'Хотори: стартовый мета-гайд',
  'Структура гайда Хотори для редакционной проверки: выводы, билды, команды, ротации и видео живут внутри одного персонажного гайда.',
  'published',
  '1.0',
  'NTE Meta',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'Временное видео для проверки встраивания. Редактор заменяет ссылку и расшифровку после подготовки настоящего гайда.'
WHERE EXISTS (SELECT 1 FROM characters WHERE id = 'hotori')
  AND NOT EXISTS (
    SELECT 1
    FROM guides
    WHERE id = 'guide-hotori' OR slug = 'hotori-burst-guide'
  );

WITH seed_sections (
  id,
  title,
  section_type,
  content_markdown,
  position
) AS (
  VALUES
    (
      'hotori-guide-tldr-0012',
      'TL;DR / короткий вывод',
      'tldr',
      'Требует редакционной проверки. Здесь редактор кратко фиксирует, стоит ли качать Хотори, для каких режимов она подходит и какие условия нужны для стабильного результата.',
      1
    ),
    (
      'hotori-guide-upgrade-0012',
      'Стоит ли качать',
      'investment',
      'Заполните после тестов патча: приоритет прокачки, сильные стороны, ограничения и ошибки новичков. Не публикуйте неподтверждённую мету как факт.',
      2
    ),
    (
      'hotori-guide-builds-0012',
      'Дуги, модули и статы',
      'build',
      'Требует проверки редакцией. Сюда добавляются лучшие дуги, альтернативные дуги, основные статы, саб-статы и логика выбора модулей.',
      3
    ),
    (
      'hotori-guide-teams-0012',
      'Лучшие команды',
      'team',
      'Команды являются частью гайда. Добавьте F2P, premium, стартовые и эндгейм-составы с объяснением роли каждого персонажа.',
      4
    ),
    (
      'hotori-guide-rotations-0012',
      'Ротации',
      'rotation',
      'Ротации описываются внутри команд: порядок переключения персонажей, навыки, баффы, окно урона и возврат к циклу.',
      5
    ),
    (
      'hotori-guide-mistakes-0012',
      'Ошибки и тонкости механик',
      'mechanics',
      'Раздел для практических нюансов: что ломает ротацию, где теряется урон, какие механики требуют отдельной проверки.',
      6
    ),
    (
      'hotori-guide-video-0012',
      'Видео-гайд / YouTube embed',
      'video',
      'Видео встроено в гайд, а не в отдельный публичный раздел. Текущая ссылка временная и должна быть заменена редактором.',
      7
    )
)
INSERT INTO guide_sections (
  id,
  guide_id,
  title,
  section_type,
  content_markdown,
  position,
  meta_json
)
SELECT
  id,
  'guide-hotori',
  title,
  section_type,
  content_markdown,
  position,
  '{}'
FROM seed_sections
WHERE EXISTS (SELECT 1 FROM guides WHERE id = 'guide-hotori')
  AND NOT EXISTS (
    SELECT 1
    FROM guide_sections
    WHERE guide_id = 'guide-hotori'
  );

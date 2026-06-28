-- Restore the minimum public guide shell when an older production D1 missed guide seeds.
-- All gameplay claims are marked as requiring editorial verification.

INSERT OR IGNORE INTO guides (
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
  'Хотори: гайд требует проверки редакцией',
  'Публичная заготовка гайда Хотори: билды, команды, ротации и выводы должны быть проверены редактором перед использованием как меты.',
  'published',
  '1.0',
  'NTE Meta',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'Видео-заглушка. Замените на настоящий YouTube-гайд и текстовую расшифровку после проверки материалов.'
WHERE EXISTS (SELECT 1 FROM characters WHERE id = 'hotori');

CREATE TABLE IF NOT EXISTS guide_seed_sections_0009 (
  id TEXT PRIMARY KEY,
  guide_id TEXT NOT NULL,
  title TEXT NOT NULL,
  section_type TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  position INTEGER NOT NULL
);

INSERT OR IGNORE INTO guide_seed_sections_0009 (
  id,
  guide_id,
  title,
  section_type,
  content_markdown,
  position
)
VALUES
  (
    'hotori-verified-tldr',
    'guide-hotori',
    'TL;DR / короткий вывод',
    'tldr',
    'Требует проверки редакцией. Используйте этот раздел как место для краткого ответа: стоит ли качать персонажа, при каких условиях и какие ограничения важны.',
    1
  ),
  (
    'hotori-verified-invest',
    'guide-hotori',
    'Стоит ли качать',
    'investment',
    'Требует проверки редакцией. Заполните условия для новичков, F2P-игроков и premium-аккаунтов после сверки с актуальным патчем.',
    2
  ),
  (
    'hotori-verified-builds',
    'guide-hotori',
    'Дуги, модули и статы',
    'build',
    'Требует проверки редакцией.' || char(10) || char(10) ||
      '## Лучшие дуги' || char(10) ||
      'Добавьте проверенные варианты.' || char(10) || char(10) ||
      '## Альтернативные дуги' || char(10) ||
      'Добавьте временные или бюджетные варианты.' || char(10) || char(10) ||
      '## Лучшие модули' || char(10) ||
      'Укажите модули и условия.' || char(10) || char(10) ||
      '## Основные статы' || char(10) ||
      'Укажите приоритеты.' || char(10) || char(10) ||
      '## Саб-статы' || char(10) ||
      'Укажите вторичные приоритеты.',
    3
  ),
  (
    'hotori-verified-teams',
    'guide-hotori',
    'Лучшие команды',
    'teams',
    'Требует проверки редакцией. Команды и ротации редактируются внутри этого гайда, а не в отдельном публичном разделе.',
    4
  ),
  (
    'hotori-verified-f2p-premium',
    'guide-hotori',
    'F2P, premium, старт и эндгейм',
    'team-options',
    'Требует проверки редакцией.' || char(10) || char(10) ||
      '## F2P-команды' || char(10) ||
      'Добавьте доступные составы.' || char(10) || char(10) ||
      '## Premium-команды' || char(10) ||
      'Добавьте дорогие составы.' || char(10) || char(10) ||
      '## Команды для старта' || char(10) ||
      'Добавьте безопасные варианты.' || char(10) || char(10) ||
      '## Команды для эндгейма' || char(10) ||
      'Добавьте варианты после тестов.',
    5
  ),
  (
    'hotori-verified-rotations',
    'guide-hotori',
    'Ротации',
    'rotation',
    'Требует проверки редакцией. Для каждого состава опишите порядок переключения персонажей и применения навыков: подготовка, баффы, дебаффы, окно урона, возврат к циклу.',
    6
  ),
  (
    'hotori-verified-video',
    'guide-hotori',
    'Видео-гайд / YouTube embed',
    'video',
    'Видео сейчас является заглушкой. Редактор должен заменить URL и расшифровку на настоящий материал после проверки.',
    7
  );

INSERT OR IGNORE INTO guide_sections (
  id,
  guide_id,
  title,
  section_type,
  content_markdown,
  position
)
SELECT
  id,
  guide_id,
  title,
  section_type,
  content_markdown,
  position
FROM guide_seed_sections_0009
WHERE EXISTS (SELECT 1 FROM guides WHERE id = 'guide-hotori')
  AND NOT EXISTS (SELECT 1 FROM guide_sections WHERE guide_id = 'guide-hotori');

DROP TABLE guide_seed_sections_0009;

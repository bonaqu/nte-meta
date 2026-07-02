-- Backfill verified Baicang profile basics without overwriting editor-confirmed data.
-- Sources used by the import workflow:
-- - GameWith NTE RU Baicang: rarity S, esper type Charms, hybrid arc, stats, skills, gifts.
-- - Fandom RU Baicang categories: roles Damage, Main DPS, Periodic Damage; faction TOI-4 / Bureau.

UPDATE characters
SET
  role = CASE
    WHEN role IN ('Support', 'Buffer', '') THEN 'Урон'
    ELSE role
  END,
  type = CASE
    WHEN type IN ('Support', 'Buffer', 'DPS', '') THEN 'Основной ДД'
    ELSE type
  END,
  attribute = CASE
    WHEN attribute IN ('Космос', 'Incantation', '') THEN 'Чары'
    ELSE attribute
  END,
  short_description = CASE
    WHEN trim(coalesce(short_description, '')) = ''
      OR lower(short_description) LIKE '%саппорт%'
      OR lower(short_description) LIKE '%баффер%'
    THEN 'Капитан ТОИ-4 из Бюро по борьбе с аномалиями, персонаж типа Чары с гибридной дугой.'
    ELSE short_description
  END,
  summary = CASE
    WHEN trim(coalesce(summary, '')) = ''
      OR lower(summary) LIKE '%саппорт%'
      OR lower(summary) LIKE '%баффер%'
    THEN 'Байканг связан с ТОИ-4 и Бюро по борьбе с аномалиями. Боевые детали и команды должны уточняться в отдельном гайде после проверки актуальных источников.'
    ELSE summary
  END,
  tags_json = CASE
    WHEN tags_json IS NULL
      OR tags_json = ''
      OR tags_json = '[]'
      OR tags_json LIKE '%support%'
      OR tags_json LIKE '%buffer%'
    THEN json_array('урон', 'основной ДД', 'периодический урон', 'ТОИ-4')
    ELSE tags_json
  END
WHERE id = 'baicang';

INSERT OR IGNORE INTO character_profiles (character_id)
VALUES ('baicang');

UPDATE character_profiles
SET
  faction = CASE
    WHEN trim(coalesce(faction, '')) = ''
      OR lower(faction) LIKE '%камели%'
    THEN 'Бюро по борьбе с аномалиями, ТОИ-4'
    ELSE faction
  END,
  arc_type = CASE
    WHEN trim(coalesce(arc_type, '')) = ''
      OR arc_type IN ('Бозе', 'Incantation', 'Космос')
    THEN 'Гибридный'
    ELSE arc_type
  END,
  birthday = CASE
    WHEN trim(coalesce(birthday, '')) = ''
    THEN '23 ноября'
    ELSE birthday
  END,
  biography_short = CASE
    WHEN trim(coalesce(biography_short, '')) = ''
      OR lower(biography_short) LIKE '%саппорт%'
      OR lower(biography_short) LIKE '%баффер%'
    THEN 'Широко известный как «самый некапитанский капитан» ТОИ-4.'
    ELSE biography_short
  END,
  role_tags_json = CASE
    WHEN role_tags_json IS NULL
      OR role_tags_json = ''
      OR role_tags_json = '[]'
      OR role_tags_json LIKE '%Support%'
      OR role_tags_json LIKE '%Buffer%'
    THEN json_array('Урон', 'Основной ДД', 'Периодический урон')
    ELSE role_tags_json
  END
WHERE character_id = 'baicang';

UPDATE guides
SET
  slug = CASE
    WHEN slug = 'baicang-support-guide'
      AND NOT EXISTS (
        SELECT 1
        FROM guides existing
        WHERE existing.slug = 'baicang-guide-review'
          AND existing.id <> guides.id
      )
    THEN 'baicang-guide-review'
    ELSE slug
  END,
  title = CASE
    WHEN lower(title) LIKE '%саппорт%' THEN 'Байканг: гайд требует редакционной проверки'
    ELSE title
  END,
  summary = CASE
    WHEN lower(summary) LIKE '%саппорт%'
      OR lower(summary) LIKE '%бафф%'
    THEN 'Мета-гайд по Байкангу нужно заполнить после проверки актуальных дуг, команд и ротаций. Профиль персонажа уже исправлен по проверенным источникам.'
    ELSE summary
  END
WHERE character_id = 'baicang';

UPDATE guide_sections
SET content_markdown = '## Требует проверки

Старый демо-текст по Байкангу был удалён, потому что роль и тип персонажа уточнены по проверенным источникам. Заполните дуги, команды и ротации только после ручной редакционной проверки.'
WHERE guide_id IN (SELECT id FROM guides WHERE character_id = 'baicang')
  AND (
    lower(content_markdown) LIKE '%саппорт%'
    OR lower(content_markdown) LIKE '%бафф%'
  );

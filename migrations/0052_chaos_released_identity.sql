-- The API translates legacy role/summary values for display.
-- Match the stored seed values as well as their displayed translations.
UPDATE characters
SET attribute = 'Лакшана',
    role = 'Основной ДД',
    type = 'Основной ДД',
    short_description = 'Урон Лакшаны по целям под Розыском и Реморой.',
    summary = 'Накапливает Преступление и расходует его на усиленный Окончательный приговор.',
    tags_json = '["Лакшана","Основной ДД","Ремора"]',
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'chaos'
  AND attribute = 'Хаос'
  AND role IN ('Unknown', 'Требует проверки')
  AND type IN ('Flex', 'Гибкая роль')
  AND short_description = 'Анонсированный персонаж. Мета-позиция будет обновлена после тестов.'
  AND summary IN (
    'По Хаосу пока нельзя честно фиксировать мету: карточка оставлена как заготовка для будущего гайда.',
    'Карточка оставлена как заготовка для будущего гайда.'
  )
  AND json(tags_json) = '["анонс","нужны тесты","не подтверждено"]';

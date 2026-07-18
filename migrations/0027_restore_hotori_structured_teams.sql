-- Move the already published Hotori compositions from plain guide markdown
-- into structured guide teams. Existing manually populated teams are preserved.

UPDATE teams
SET
  guide_id = 'guide-hotori',
  title = 'Премиум-состав',
  team_type = '',
  budget = 'Mixed',
  difficulty = '',
  power = 0,
  good_at = '',
  weak_at = '',
  synergy = 'Наналли поддерживает атрибут Космос, Адлер помогает снижать защиту цели и защищает отряд, Эдгар отвечает за лечение, а Хотори закрывает подготовленное окно сверхспособностью.',
  rotation = 'Начните бой базовыми атаками и накопите цикл эспера.\nПримените навык поддержки Хотори.\nПереключитесь на союзников и активируйте командные усиления.\nВернитесь к Хотори и выполните ещё два действия перенаправления или поддержки.\nСразу активируйте сверхспособность.\nПродолжите базовыми атаками и начните подготовку следующего цикла.',
  rotation_steps_json = '["Начните бой базовыми атаками и накопите цикл эспера.","Примените навык поддержки Хотори.","Переключитесь на союзников и активируйте командные усиления.","Вернитесь к Хотори и выполните ещё два действия перенаправления или поддержки.","Сразу активируйте сверхспособность.","Продолжите базовыми атаками и начните подготовку следующего цикла."]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'team-chaos-eclipse'
  AND NOT EXISTS (
    SELECT 1 FROM team_members WHERE team_id = 'team-chaos-eclipse'
  );

INSERT OR IGNORE INTO team_members (team_id, character_id, role, position)
SELECT 'team-chaos-eclipse', candidate.character_id, candidate.role, candidate.position
FROM (
  SELECT 'nanally' AS character_id, 'Поддержка' AS role, 1 AS position
  UNION ALL SELECT 'hotori', 'Основной ДД', 2
  UNION ALL SELECT 'adler', 'Защита и ослабление', 3
  UNION ALL SELECT 'edgar', 'Лечение', 4
) AS candidate
WHERE EXISTS (SELECT 1 FROM teams WHERE id = 'team-chaos-eclipse')
  AND (SELECT COUNT(*) FROM team_members WHERE team_id = 'team-chaos-eclipse') = 0
  AND EXISTS (SELECT 1 FROM characters WHERE id = candidate.character_id);

INSERT OR IGNORE INTO teams (
  id,
  slug,
  guide_id,
  title,
  team_type,
  budget,
  difficulty,
  power,
  good_at,
  weak_at,
  synergy,
  rotation,
  rotation_steps_json,
  status
)
SELECT
  'team-hotori-accessible',
  'hotori-accessible',
  'guide-hotori',
  'Более доступный состав',
  '',
  'Mixed',
  '',
  0,
  '',
  '',
  'Фадия принимает и перенаправляет урон, Ханиэль усиливает команду, Эдгар лечит. Состав проще собрать без полного набора S-ранговых партнёров.',
  '',
  '[]',
  'published'
WHERE EXISTS (SELECT 1 FROM guides WHERE id = 'guide-hotori');

INSERT OR IGNORE INTO team_members (team_id, character_id, role, position)
SELECT 'team-hotori-accessible', candidate.character_id, candidate.role, candidate.position
FROM (
  SELECT 'hotori' AS character_id, 'Основной ДД' AS role, 1 AS position
  UNION ALL SELECT 'fadia', 'Контроль', 2
  UNION ALL SELECT 'haniel', 'Усиление', 3
  UNION ALL SELECT 'edgar', 'Лечение', 4
) AS candidate
WHERE EXISTS (SELECT 1 FROM teams WHERE id = 'team-hotori-accessible')
  AND (SELECT COUNT(*) FROM team_members WHERE team_id = 'team-hotori-accessible') = 0
  AND EXISTS (SELECT 1 FROM characters WHERE id = candidate.character_id);

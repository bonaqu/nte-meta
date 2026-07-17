-- Fill only empty Hotori profile collections with verified Russian data.
-- Sources:
-- - GameWith RU: materials, awakening names/effects and favorite gifts.
-- - Neverness Codex: affinity requirements, gift points and direct gift icons.
-- - GenshinBuilds RU + Neverness Codex: cross-check for the disputed C1 value (12%).

UPDATE character_profiles
SET
  awakenings_json = CASE
    WHEN awakenings_json IS NULL OR awakenings_json = '' OR awakenings_json = '[]' THEN json_array(
      json_object(
        'level', 1,
        'name', 'Красочный финт',
        'iconUrl', '',
        'description', 'Увеличивает урон Хотори во время остановки времени на 12 % за каждый записанный навык поддержки или навык перенаправления.'
      ),
      json_object(
        'level', 2,
        'name', 'Далекие воспоминания',
        'iconUrl', '',
        'description', 'Во время остановки времени Хотори наносит на 20 % больше урона.'
      ),
      json_object(
        'level', 3,
        'name', 'Мгновенный взгляд',
        'iconUrl', '',
        'description', 'Восстанавливает энергию, затраченную на «Настоящее воспроизведение», после использования навыка и завершения записи. Срабатывает не чаще одного раза в 60 секунд. Расход энергии прерывает восстановление.'
      ),
      json_object(
        'level', 4,
        'name', 'Разрозненные реликвии',
        'iconUrl', '',
        'description', 'Даёт Незакрытым часам ещё 10 ед. энергии за каждую цель, пока стрелка не перематывается назад, до 3 раз. Применение «Мирового прилива» сбрасывает счётчик.'
      ),
      json_object(
        'level', 5,
        'name', 'Всевидение',
        'iconUrl', '',
        'description', 'Если Хотори находится в отряде и на поле только один противник, урон всей команды по этой цели увеличивается на 15 %. Эффект пропадает, когда Хотори выведена из строя.'
      ),
      json_object(
        'level', 6,
        'name', 'Время все забирает',
        'iconUrl', '',
        'description', 'Во время остановки времени Хотори игнорирует 30 % защиты цели.'
      )
    )
    ELSE awakenings_json
  END,
  materials_json = CASE
    WHEN materials_json IS NULL OR materials_json = '' OR materials_json = '[]' THEN json_array(
      json_object(
        'id', 'hotori-lost-whispers',
        'name', 'Потерянный шёпот',
        'iconUrl', '',
        'amount', '×17',
        'source', 'Материалы прорыва до ур. 80; источник: GameWith RU.'
      ),
      json_object(
        'id', 'hotori-confessional-flower-seed',
        'name', 'Семя исповедального цветка',
        'iconUrl', '',
        'amount', '×86',
        'source', 'Материалы прорыва до ур. 80; источник: GameWith RU.'
      ),
      json_object(
        'id', 'hotori-obscure-whispers',
        'name', 'Неясный шёпот',
        'iconUrl', '',
        'amount', '×18',
        'source', 'Материалы прорыва до ур. 80; источник: GameWith RU.'
      ),
      json_object(
        'id', 'hotori-paradoxical-whispers',
        'name', 'Парадоксальный шёпот',
        'iconUrl', '',
        'amount', '×15',
        'source', 'Материалы прорыва до ур. 80; источник: GameWith RU.'
      )
    )
    ELSE materials_json
  END,
  friendship_json = CASE
    WHEN friendship_json IS NULL OR friendship_json = '' OR friendship_json = '[]' THEN json_array(
      json_object('level', 1, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 1 требуется 100 очков симпатии.', 'rewards', json_array()),
      json_object('level', 2, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 2 требуется 500 очков симпатии.', 'rewards', json_array()),
      json_object('level', 3, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 3 требуется 1 000 очков симпатии.', 'rewards', json_array()),
      json_object('level', 4, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 4 требуется 2 000 очков симпатии.', 'rewards', json_array()),
      json_object('level', 5, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 5 требуется 3 500 очков симпатии.', 'rewards', json_array()),
      json_object('level', 6, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 6 требуется 5 000 очков симпатии.', 'rewards', json_array()),
      json_object('level', 7, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 7 требуется 7 000 очков симпатии.', 'rewards', json_array()),
      json_object('level', 8, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 8 требуется 9 000 очков симпатии.', 'rewards', json_array()),
      json_object('level', 9, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 9 требуется 12 000 очков симпатии.', 'rewards', json_array()),
      json_object('level', 10, 'rewardName', '', 'rewardIconUrl', '', 'description', 'Для достижения уровня 10 требуется 16 000 очков симпатии.', 'rewards', json_array())
    )
    ELSE friendship_json
  END,
  gifts_json = CASE
    WHEN gifts_json IS NULL OR gifts_json = '' OR gifts_json = '[]' THEN json_array(
      json_object('id', 'SpecialGift_letter', 'name', 'Рукописное письмо', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/SpecialGift_letter.webp', 'effect', '+2 000 очков симпатии · награда за задание'),
      json_object('id', 'Furniture_Ornament_002', 'name', 'Золотая луна', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/Furniture_Ornament_002.webp', 'effect', '+400 очков симпатии · 15 000 фонов'),
      json_object('id', 'SpecialGift_ticket', 'name', 'Билет в кинотеатр «Флоу»', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/SpecialGift_ticket.webp', 'effect', '+400 очков симпатии · не продаётся за фоны'),
      json_object('id', 'Flower0000', 'name', 'Золотой источник', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/Flower0000.webp', 'effect', '+200 очков симпатии · 7 500 фонов'),
      json_object('id', 'Furniture_FlowerPot_001', 'name', 'Ваза с жёлтой глазурью', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/Furniture_FlowerPot_001.webp', 'effect', '+200 очков симпатии · 3 600 фонов'),
      json_object('id', 'Food_038', 'name', 'Семейный напиток Чиё', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/Food_038.webp', 'effect', '+100 очков симпатии · 300 фонов'),
      json_object('id', 'Food_098', 'name', 'Чжу! Витамин!', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/Food_098.webp', 'effect', '+100 очков симпатии · 750 фонов'),
      json_object('id', 'Food_103', 'name', 'Королевская башня Эбису', 'iconUrl', 'https://www.neverness.app/assets/codex/likeability/Food_103.webp', 'effect', '+100 очков симпатии · не продаётся за фоны')
    )
    ELSE gifts_json
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE character_id = (
  SELECT id
  FROM characters
  WHERE slug = 'hotori' OR name = 'Хотори' OR original_name = 'Hotori'
  LIMIT 1
);

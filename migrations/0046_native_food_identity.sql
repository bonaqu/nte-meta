-- Resolve native food aliases without replacing custom names, icons or other profile fields.
WITH native_items(id,name,icon) AS (VALUES
('food_003','Кофе холодной заварки 0-К','https://www.neverness.app/assets/codex/likeability/Food_003.webp'),
('food_004','Цельнозерновой хлеб «Маги-Пафф»','https://www.neverness.app/assets/codex/likeability/Food_004.webp'),
('food_005','Дынный хлеб «Сакай»','https://www.neverness.app/assets/codex/likeability/Food_005.webp'),
('food_006','Острый снэк «Кул-ла-ла»','https://www.neverness.app/assets/codex/likeability/Food_006.webp'),
('food_009','Освежающий фруктовый вкус','https://www.neverness.app/assets/codex/likeability/Food_009.webp'),
('food_010','Освежающий ледник','/nte-meta/game-assets/2c8b91d5fe658583ce58.webp'),
('food_011','Освежающая тайна','https://www.neverness.app/assets/codex/likeability/Food_011.webp'),
('food_012','Классические чипсы от Губичи','https://www.neverness.app/assets/codex/likeability/Food_012.webp'),
('food_015','Жажда вкусняшек! Молочный вкус','https://www.neverness.app/assets/codex/likeability/Food_015.webp'),
('food_018','Чайный сад Боба','https://www.neverness.app/assets/codex/likeability/Food_018.webp'),
('food_025','Шоколад «Пука»: пикантный вызов','https://www.neverness.app/assets/codex/likeability/Food_025.webp'),
('food_026','Шоколад Пука: эксклюзив тура Элли','https://www.neverness.app/assets/codex/likeability/Food_026.webp'),
('food_027','Мечтательный зефир «Пука»','https://www.neverness.app/assets/codex/likeability/Food_027.webp'),
('food_028','Счастливая звезда «Пука»','/nte-meta/game-assets/f398fe334d9ba045beac.webp'),
('food_032','Снежный пуддинг из тофу','https://www.neverness.app/assets/codex/likeability/Food_032.webp'),
('food_034','Сезонная суши-лодка','https://www.neverness.app/assets/codex/likeability/Food_034.webp'),
('food_038','Семейный напиток Чиё','https://www.neverness.app/assets/codex/likeability/Food_038.webp'),
('food_039','Томато 100','https://www.neverness.app/assets/codex/likeability/Food_039.webp'),
('food_041','Миска якитори с ананасами','/nte-meta/game-assets/9c7cea05c76d092fb5bf.webp'),
('food_044','Картошка фри «Кликки»','https://www.neverness.app/assets/codex/likeability/Food_044.webp'),
('food_045','Лавабургер «Кликки»','https://www.neverness.app/assets/codex/likeability/Food_045.webp'),
('food_051','Торт с розой и личи','https://www.neverness.app/assets/codex/likeability/Food_051.webp'),
('food_054','Кофе холодной заварки','https://www.neverness.app/assets/codex/likeability/Food_054.webp'),
('food_055','Алхимия современности','https://www.neverness.app/assets/codex/likeability/Food_055.webp'),
('food_060','Глубины сердца','https://www.neverness.app/assets/codex/likeability/Food_060.webp'),
('food_061','Банджо странника','https://www.neverness.app/assets/codex/likeability/Food_061.webp'),
('food_062','Песнь гладиатора','https://www.neverness.app/assets/codex/likeability/Food_062.webp'),
('food_063','Молочный чай с таро «Удар Нянко»','https://www.neverness.app/assets/codex/likeability/Food_063.webp'),
('food_064','Чай грязный Боба «Всплеск Нянко»','https://www.neverness.app/assets/codex/likeability/Food_064.webp'),
('food_066','Матча удзи «Уют Нянко»','https://www.neverness.app/assets/codex/likeability/Food_066.webp'),
('food_078','Большой баоцзы с заварным кремом','https://www.neverness.app/assets/codex/likeability/Food_078.webp'),
('food_083','Веганский рамен «Некомару»','https://www.neverness.app/assets/codex/likeability/Food_083.webp'),
('food_084','Рамен «Некомару Они»','https://www.neverness.app/assets/codex/likeability/Food_084.webp'),
('food_085','Классическое трио','https://www.neverness.app/assets/codex/likeability/Food_085.webp'),
('food_091','Гамбургский мегастейк','https://www.neverness.app/assets/codex/likeability/Food_091.webp'),
('food_092','Красочный легкий салат','https://www.neverness.app/assets/codex/likeability/Food_092.webp'),
('food_093','Детское энергетическое питание','https://www.neverness.app/assets/codex/likeability/Food_093.webp'),
('food_094','Охлаждающий глоток свежести','https://www.neverness.app/assets/codex/likeability/Food_094.webp'),
('food_095','Пастилки для защиты от воспаления','https://www.neverness.app/assets/codex/likeability/Food_095.webp'),
('food_097','Великий защитник!','https://www.neverness.app/assets/codex/likeability/Food_097.webp'),
('food_098','Чжу! Витамин!','https://www.neverness.app/assets/codex/likeability/Food_098.webp'),
('food_100','Желе «Томато 100»','https://www.neverness.app/assets/codex/likeability/Food_100.webp'),
('food_101','Сок «Томато 100»','https://www.neverness.app/assets/codex/likeability/Food_101.webp'),
('food_102','Молочный коктейль «Томато 100»','https://www.neverness.app/assets/codex/likeability/Food_102.webp'),
('food_103','Королевская башня Эбису','https://www.neverness.app/assets/codex/likeability/Food_103.webp'),
('food_119','Паэлья с морепродуктами «Фейерверк»','https://www.neverness.app/assets/codex/likeability/Food_119.webp'),
('food_128','Памятный кофе от «Пука»','https://www.neverness.app/assets/codex/likeability/Food_128.webp'),
('food_129','Молочный чай «Облачная сладость»','https://www.neverness.app/assets/codex/likeability/Food_129.webp'),
('food_130','Молочный чай «Горячий шоколад»','https://www.neverness.app/assets/codex/likeability/Food_130.webp'),
('food_132','Жуткая вафля с соусом','https://www.neverness.app/assets/codex/likeability/Food_132.webp'),
('food_133','Хрустящий рожок «Пудинг-лодочка»','https://www.neverness.app/assets/codex/likeability/Food_133.webp'),
('food_134','Фруктовый лёд «Перчатка Пукабу»','https://www.neverness.app/assets/codex/likeability/Food_134.webp'),
('food_135','Леденец «Дерево из сахарной ваты»','https://www.neverness.app/assets/codex/likeability/Food_135.webp'),
('food_136','Карамельная трость «Котёнок в цилиндре»','https://www.neverness.app/assets/codex/likeability/Food_136.webp'),
('food_137','Жвачка «Осьминог-пират»','https://www.neverness.app/assets/codex/likeability/Food_137.webp'),
('food_138','Куриное комбо «Бой в клетке»','https://www.neverness.app/assets/codex/likeability/Food_138.webp'),
('food_139','Гигантская индюшачья ножка «Взрывная хлопушка»','https://www.neverness.app/assets/codex/likeability/Food_139.webp'),
('food_140','Гигантский хот-дог','https://www.neverness.app/assets/codex/likeability/Food_140.webp'),
('food_141','Набор угощений «Пукабу»','https://www.neverness.app/assets/codex/likeability/Food_141.webp'),
('food_142','Рисовая лапша с жар-птицей и грудинкой','/nte-meta/game-assets/fddd2c59f21c8c06cb09.webp')
)
UPDATE character_profiles SET gifts_json=(
 SELECT json_group_array(json(patched)) FROM (
  SELECT CASE WHEN n.id IS NULL THEN e.value ELSE json_set(e.value,
    '$.name', CASE WHEN coalesce(json_extract(e.value,'$.name'),'')='' OR lower(json_extract(e.value,'$.name')) GLOB 'food_[0-9]*' THEN n.name ELSE json_extract(e.value,'$.name') END,
    '$.iconUrl', CASE WHEN coalesce(json_extract(e.value,'$.iconUrl'),'')='' THEN n.icon ELSE json_extract(e.value,'$.iconUrl') END
  ) END AS patched
  FROM json_each(character_profiles.gifts_json) e
  LEFT JOIN native_items n ON n.id=lower(json_extract(e.value,'$.id'))
  ORDER BY CAST(e.key AS INTEGER)
 )
)
WHERE EXISTS (
 SELECT 1 FROM json_each(character_profiles.gifts_json) e JOIN native_items n ON n.id=lower(json_extract(e.value,'$.id'))
 WHERE coalesce(json_extract(e.value,'$.name'),'')='' OR lower(json_extract(e.value,'$.name')) GLOB 'food_[0-9]*' OR (coalesce(json_extract(e.value,'$.iconUrl'),'')='' AND n.icon<>'')
);

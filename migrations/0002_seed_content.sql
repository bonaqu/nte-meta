INSERT OR IGNORE INTO characters
(id, slug, name, original_name, rarity, role, type, attribute, tier, premium_tier, tier_rank, image_url, splash_url, short_description, summary, tags_json, status, patch_version)
VALUES
('hotori', 'hotori', 'Хотори', 'Hotori', 'S', 'Burst DPS', 'DPS', 'Хаос', 'S+', 'S+', 10, 'assets/characters/Hotori.webp', 'assets/characters/Hotori.webp', 'Взрывной керри для быстрого окна урона и босс-файтов.', 'Хотори играет вокруг заранее подготовленного окна урона: сначала команда собирает баффы и контроль, затем она быстро прожимает ключевую цепочку навыков.', '["meta","burst","bossing","сложная ротация"]', 'published', '1.0'),
('lacrimosa', 'lacrimosa', 'Лакримоза', 'Lacrimosa', 'S', 'Debuffer', 'Debuffer', 'Лакшана', 'S', 'S+', 20, 'assets/characters/Lacrimosa.webp', 'assets/characters/Lacrimosa.webp', 'Ослабляет цель, раскрывает команды с высоким burst-потолком.', 'Лакримоза ценна не личным уроном, а тем, насколько ровно она открывает окно для основного DPS.', '["debuff","premium","bossing"]', 'published', '1.0'),
('baicang', 'baicang', 'Байканг', 'Baicang', 'S', 'Support', 'Buffer', 'Космос', 'S', 'S', 20, 'assets/characters/Baicang.webp', 'assets/characters/Baicang.webp', 'Универсальный саппорт для стабильных команд и комфортного старта.', 'Байканг хорошо закрывает слоты баффера и страховки, поэтому подходит как для F2P-пачек, так и для премиум-команд.', '["support","f2p-friendly","универсальный"]', 'published', '1.0'),
('fadia', 'fadia', 'Фадия', 'Fadia', 'S', 'Control', 'Control', 'Психика', 'S', 'S', 20, 'assets/characters/Fadia.webp', 'assets/characters/Fadia.webp', 'Контроль темпа боя, прерывания и безопасные окна для команды.', 'Фадия усиливает команды, которым важно удерживать врагов внутри зоны урона.', '["control","utility","aoe"]', 'published', '1.0'),
('sakiri', 'sakiri', 'Сакири', 'Sakiri', 'S', 'Sustain DPS', 'DPS', 'Анима', 'S', 'S+', 20, 'assets/characters/Sakiri.webp', 'assets/characters/Sakiri.webp', 'Стабильный DPS, который меньше зависит от идеального burst-окна.', 'Сакири прощает часть ошибок в таймингах и поэтому хороша в длинных боях.', '["sustain","endgame","beginner-safe"]', 'published', '1.0'),
('nanally', 'nanally', 'Наналли', 'Nanally', 'S', 'Healer', 'Healer', 'Чары', 'A', 'S', 30, 'assets/characters/Nanally.webp', 'assets/characters/Nanally.webp', 'Комфортный хилер для прогресса и долгих активностей.', 'Наналли снижает требования к исполнению и помогает пройти контент, где команда пока не закрывает бой чистым уроном.', '["healer","comfort","start"]', 'published', '1.0'),
('daffodill', 'daffodill', 'Даффодил', 'Daffodill', 'S', 'AoE DPS', 'DPS', 'Чары', 'A', 'S', 30, 'assets/characters/Daffodill.webp', 'assets/characters/Daffodill.webp', 'Сильна на волнах врагов и фарме, требовательна к позиционированию.', 'Даффодил раскрывается, когда враги собраны в зоне навыков.', '["aoe","farm","positioning"]', 'published', '1.0'),
('hathor', 'hathor', 'Хатор', 'Hathor', 'S', 'Tank', 'Tank', 'Космос', 'A', 'A', 30, 'assets/characters/Hathor.png', 'assets/characters/Hathor.png', 'Защита, перехват давления и комфорт для неопытной команды.', 'Хатор полезна, когда команда часто теряет здоровье и нуждается в спокойном темпе боя.', '["tank","survival","beginner"]', 'published', '1.0'),
('jiuyuan', 'jiuyuan', 'Цзююань', 'Jiuyuan', 'S', 'Buffer', 'Buffer', 'Психика', 'A', 'S', 30, 'assets/characters/Jiuyuan.webp', 'assets/characters/Jiuyuan.webp', 'Баффер для команд, где важно усилить одно короткое окно.', 'Цзююань требует аккуратного тайминга, зато хорошо масштабирует команды с одним главным керри.', '["buffer","burst-window","premium"]', 'published', '1.0'),
('chiz', 'chiz', 'Чиз', 'Chiz', 'S', 'Sub DPS', 'DPS', 'Хаос', 'A', 'A', 30, 'assets/characters/Chiz.webp', 'assets/characters/Chiz.webp', 'Дополнительный урон и добивание, когда основному DPS нужен перерыв.', 'Чиз удобен как гибкий слот для промежуточного урона.', '["sub-dps","flex","rotation-fill"]', 'published', '1.0'),
('mint', 'mint', 'Минт', 'Mint', 'A', 'Support', 'Support', 'Анима', 'A', 'A', 30, 'assets/characters/Mint.webp', 'assets/characters/Mint.webp', 'Доступный саппорт для ранней игры и F2P-команд.', 'Минт хороша как бюджетный стабилизатор команды.', '["f2p","support","start"]', 'published', '1.0'),
('aurelia', 'aurelia', 'Аурелия', 'Aurelia', 'A', 'Debuffer', 'Debuffer', 'Космос', 'B', 'A', 40, 'assets/characters/Aurelia.png', 'assets/characters/Aurelia.png', 'Бюджетные ослабления и полезность, если нет S-саппортов.', 'Аурелия помогает новым аккаунтам собрать рабочую пачку без дорогих вложений.', '["budget","debuff","starter"]', 'published', '1.0'),
('adler', 'adler', 'Адлер', 'Adler', 'A', 'DPS', 'DPS', 'Психика', 'B', 'A', 40, 'assets/characters/Adler.webp', 'assets/characters/Adler.webp', 'Простой стартовый DPS с понятной ротацией.', 'Адлер помогает разобраться с базовой логикой навыков и смены персонажей.', '["starter","simple","f2p"]', 'published', '1.0'),
('skia', 'skia', 'Ския', 'Skia', 'A', 'Control', 'Control', 'Чары', 'B', 'A', 40, 'assets/characters/Skia.webp', 'assets/characters/Skia.webp', 'Контроль толпы и комфорт в фарм-комнатах.', 'Ския полезна в AoE-сценариях, где контроль дает больше результата, чем одиночный урон.', '["control","farm","aoe"]', 'published', '1.0'),
('haniel', 'haniel', 'Ханиэль', 'Haniel', 'A', 'Healer', 'Healer', 'Лакшана', 'B', 'A', 40, 'assets/characters/Haniel.webp', 'assets/characters/Haniel.webp', 'Бюджетное восстановление и страховка в долгих боях.', 'Ханиэль закрывает потребность в выживаемости на старте.', '["healer","budget","safe"]', 'published', '1.0'),
('edgar', 'edgar', 'Эдгар', 'Edgar', 'A', 'Tank', 'Tank', 'Анима', 'C', 'B', 50, 'assets/characters/Edgar.webp', 'assets/characters/Edgar.webp', 'Ситуативная защита, когда нужен простой фронтлайн.', 'Эдгар полезен как временный танк, но часто проигрывает гибким слотам.', '["tank","situational","starter"]', 'published', '1.0'),
('esper-zero', 'esper-zero', 'Нулевой эспер', 'Esper Zero', 'Нулевой', 'Flex', 'Flex', 'Космос', 'A', 'A', 30, 'assets/characters/Esper-Zero-Male.png', 'assets/characters/Esper-Zero-Female.png', 'Гибкий главный герой для закрытия недостающей роли в пачке.', 'Нулевой эспер ценен гибкостью и ранней доступностью.', '["free","flex","story"]', 'published', '1.0'),
('chaos', 'chaos', 'Хаос', 'Chaos', 'S', 'Unknown', 'Flex', 'Хаос', 'C', 'C', 50, 'assets/characters/Chaos.png', 'assets/characters/Chaos.png', 'Анонсированный персонаж. Мета-позиция будет обновлена после тестов.', 'По Хаосу пока нельзя честно фиксировать мету: карточка оставлена как заготовка для будущего гайда.', '["анонс","нужны тесты","не подтверждено"]', 'published', '1.0');

INSERT OR IGNORE INTO guides
(id, slug, character_id, title, summary, status, patch_version, author_name, video_url)
VALUES
('guide-hotori', 'hotori-burst-guide', 'hotori', 'Хотори: burst-гайд, ротации и команды', 'Практический разбор Хотори: окно урона, ошибки, F2P и premium команды.', 'published', '1.0', 'NTE Meta', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
('guide-baicang', 'baicang-support-guide', 'baicang', 'Байканг: универсальный саппорт и лучшие пары', 'Когда брать Байканга, кому он дает максимум и как не потерять бафф-окно.', 'published', '1.0', 'NTE Meta', NULL),
('guide-sakiri', 'sakiri-sustain-guide', 'sakiri', 'Сакири: стабильный DPS без идеального окна', 'Гайд для игроков, которым нужен ровный урон и меньше наказания за ошибки.', 'published', '1.0', 'NTE Meta', NULL);

INSERT OR IGNORE INTO guide_sections
(id, guide_id, title, section_type, content_markdown, position)
VALUES
('hotori-overview', 'guide-hotori', 'Обзор персонажа', 'overview', 'Хотори - основной burst DPS. Ее сила не в бесконечном нахождении на поле, а в коротком, заранее подготовленном окне урона.', 1),
('hotori-summary', 'guide-hotori', 'Краткий вывод', 'verdict', 'Качать стоит, если аккаунт уже имеет саппортов для окна урона. Для новичка она сильна, но требует дисциплины.', 2),
('hotori-pros', 'guide-hotori', 'Плюсы', 'pros', '- Очень высокий burst-потолок
- Отлично масштабируется от премиум-саппортов
- Сильна против боссов и плотных целей', 3),
('hotori-cons', 'guide-hotori', 'Минусы', 'cons', '- Ошибки в порядке навыков заметно снижают урон
- Нуждается в энергии и подготовке
- В фарме волн может проигрывать AoE-специалистам', 4),
('hotori-skills', 'guide-hotori', 'Навыки и тонкости', 'skills', 'Главная ошибка - прожимать усиленный навык до того, как команда повесила все баффы и ослабления.', 5),
('hotori-rotations', 'guide-hotori', 'Базовая, оптимальная и продвинутая ротации', 'rotations', '**База:** саппорт -> дебаффер -> Хотори skill -> burst -> добивание.

**Advanced:** задержи burst до окна уязвимости босса, заранее набрав ресурс на предыдущей фазе.', 6),
('hotori-mistakes', 'guide-hotori', 'Ошибки новичков', 'mistakes', '- Начинать с Хотори без подготовки
- Тратить burst в фазу иммунитета
- Игнорировать саб-статы на восстановление ресурса', 7),
('hotori-build', 'guide-hotori', 'Дуга, модули и статы', 'build', 'Лучшая дуга - burst-ориентированная. Основные статы: крит, бонус урона, восстановление ресурса. Саб-статы: крит, атака, скорость набора ресурса.', 8),
('hotori-teams', 'guide-hotori', 'Лучшие команды', 'teams', '**F2P:** Хотори / Минт / Ханиэль / Нулевой эспер.

**Premium:** Хотори / Лакримоза / Байканг / Цзююань.', 9),
('baicang-overview', 'guide-baicang', 'Обзор персонажа', 'overview', 'Байканг - надежный саппорт, который делает команды стабильнее.', 1),
('sakiri-overview', 'guide-sakiri', 'Обзор персонажа', 'overview', 'Сакири выигрывает длинные бои за счет стабильности.', 1);

INSERT OR IGNORE INTO rotations
(id, guide_id, character_id, title, rotation_type, purpose, steps_json, logic, status)
VALUES
('rot-hotori-basic', 'guide-hotori', 'hotori', 'Простая ротация Хотори', 'Простая', 'Быстрое окно урона для старта аккаунта', '["Минт: бафф","Лакримоза или Аурелия: ослабление","Хотори: skill","Хотори: burst","Swap на саппорта"]', 'Главная цель - не держать Хотори на поле до подготовки команды.', 'published'),
('rot-hotori-boss', 'guide-hotori', 'hotori', 'Boss rotation', 'Boss rotation', 'Попасть burst-цепочкой в окно уязвимости босса', '["Накопить ресурс до фазы","Фадия: контроль","Байканг: бафф","Лакримоза: дебафф","Хотори: полный burst"]', 'Ротация сильнее простой, но требует знания таймингов босса.', 'published');

INSERT OR IGNORE INTO teams
(id, slug, title, team_type, budget, difficulty, power, good_at, weak_at, synergy, rotation, status)
VALUES
('team-chaos-eclipse', 'chaos-eclipse', 'Chaos Eclipse', 'Bossing', 'Premium', 'Высокая', 94, 'Боссы и короткие окна уязвимости', 'Длинный фарм волн без плотных целей', 'Лакримоза и Байканг готовят окно, Фадия удерживает цель, Хотори закрывает фазу burst-цепочкой.', 'Фадия -> Байканг -> Лакримоза -> Хотори -> повтор подготовки.', 'published'),
('team-starter-core', 'starter-core', 'Starter Core', 'Beginner', 'F2P', 'Низкая', 72, 'Сюжет и ранний фарм', 'Таймерный эндгейм', 'Минт и Ханиэль страхуют, Нулевой эспер закрывает гибкий слот, Адлер дает простой урон.', 'Минт -> Адлер -> Нулевой эспер -> Ханиэль по необходимости.', 'published'),
('team-farm-loop', 'neon-farm-loop', 'Neon Farm Loop', 'Farming', 'Mixed', 'Средняя', 81, 'AoE, комнаты с волнами, быстрый фарм материалов', 'Одиночные боссы с коротким окном уязвимости', 'Даффодил наносит AoE-урон, Ския собирает и контролирует, Байканг поддерживает темп.', 'Ския -> Байканг -> Даффодил -> Чиз для добивания.', 'published');

INSERT OR IGNORE INTO team_members (team_id, character_id, role, position)
VALUES
('team-chaos-eclipse', 'hotori', 'Main DPS', 1),
('team-chaos-eclipse', 'lacrimosa', 'Debuffer', 2),
('team-chaos-eclipse', 'baicang', 'Buffer', 3),
('team-chaos-eclipse', 'fadia', 'Control', 4),
('team-starter-core', 'adler', 'Main DPS', 1),
('team-starter-core', 'mint', 'Support', 2),
('team-starter-core', 'haniel', 'Healer', 3),
('team-starter-core', 'esper-zero', 'Flex', 4),
('team-farm-loop', 'daffodill', 'AoE DPS', 1),
('team-farm-loop', 'skia', 'Control', 2),
('team-farm-loop', 'baicang', 'Support', 3),
('team-farm-loop', 'chiz', 'Sub DPS', 4);

INSERT OR IGNORE INTO tierlists
(id, slug, title, tierlist_type, patch_version, status, changelog_json)
VALUES
('tier-base-10', 'base-c0-10', 'Base C0 тир-лист', 'base', '1.0', 'published', '["Первый публичный редакционный список","Хаос оставлен в C до подтвержденных тестов"]'),
('tier-premium-10', 'premium-c6-10', 'Premium C6 тир-лист', 'premium', '1.0', 'published', '["Добавлен отдельный premium view","Персонажи с сильным scaling подняты отдельно от base"]');

INSERT OR IGNORE INTO tierlist_items (tierlist_id, character_id, tier, tier_rank, position, note)
SELECT 'tier-base-10', id, tier, tier_rank, ROW_NUMBER() OVER (ORDER BY tier_rank, name), 'Редакционная оценка NTE Meta' FROM characters;

INSERT OR IGNORE INTO tierlist_items (tierlist_id, character_id, tier, tier_rank, position, note)
SELECT 'tier-premium-10', id, premium_tier,
CASE premium_tier WHEN 'S+' THEN 10 WHEN 'S' THEN 20 WHEN 'A' THEN 30 WHEN 'B' THEN 40 ELSE 50 END,
ROW_NUMBER() OVER (ORDER BY CASE premium_tier WHEN 'S+' THEN 10 WHEN 'S' THEN 20 WHEN 'A' THEN 30 WHEN 'B' THEN 40 ELSE 50 END, name),
'Оценка предполагает высокий уровень вложений и оптимальные команды' FROM characters;

INSERT OR IGNORE INTO news
(id, slug, title, summary, body_markdown, author_name, category, source_name, image_url, tags_json, status)
VALUES
('news-patch-10', 'patch-10-first-meta-notes', 'Патч 1.0: первые заметки по мете', 'Команда NTE Meta готовит первые глубокие гайды: ротации, команды и ошибки новичков.', 'Мы не гонимся за количеством страниц. В приоритете практичные материалы: кого качать, как играть, какие команды собирать и как не терять урон в ротации.', 'NTE Meta', 'Обновления', 'Редакция', 'assets/characters/Baicang.webp', '["патч 1.0","мета","гайд"]', 'published'),
('news-guides-roadmap', 'guides-roadmap-june', 'План гайдов на июнь', 'В работе страницы Хотори, Байканга, Сакири и стартовых F2P-команд.', 'Каждый гайд будет включать базовую, оптимальную и advanced-ротацию, сравнение билдов, команды и раздел ошибок.', 'NTE Meta', 'Официальные новости', 'Редакция', 'assets/characters/Hotori.webp', '["roadmap","guides"]', 'published');

INSERT OR IGNORE INTO leaks
(id, slug, title, summary, body_markdown, source_name, source_url, trust_level, leak_status, approved, tags_json)
VALUES
('leak-arc-rumor', 'new-arc-rumor', 'Слух: новая Дуга для burst-команд', 'Источник утверждает, что тестируется Дуга с усилением короткого окна урона.', 'Информация не подтверждена. Не стоит заранее тратить ресурсы или менять план прокачки до официальных данных.', 'Telegram source placeholder', 'https://t.me/example', 'средний', 'слух', 1, '["дуга","слух","burst"]'),
('leak-chaos-kit', 'chaos-kit-unconfirmed', 'Неподтверждено: набор навыков Хаоса', 'В очереди на проверку - пост с описанием возможной механики Хаоса.', 'Публикация показывает будущий workflow: импорт из источника попадает в очередь, редактор правит заголовок и только потом публикует.', 'Source queue demo', NULL, 'низкий', 'слив', 1, '["хаос","очередь","не подтверждено"]');

INSERT OR IGNORE INTO sources
(id, source_type, source_url, source_name, trust_level, auto_import_enabled)
VALUES
('source-manual', 'manual', 'https://nte-meta.local/manual', 'Ручная публикация редакции', 'высокий', 0),
('source-telegram-demo', 'telegram', 'https://t.me/example', 'Telegram leaks source placeholder', 'средний', 0);

INSERT OR IGNORE INTO settings (key, value_json)
VALUES
('site', '{"title":"NTE Meta","language":"ru","leaksRequireApproval":true,"registrationEnabled":true}'),
('seo', '{"canonical":"https://bonaqu.github.io/nte-hub/","description":"Русскоязычный meta-hub по Neverness to Everness"}');

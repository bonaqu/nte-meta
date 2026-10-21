-- Registry audited 2026-10-21. Existing switches/names/trust are preserved.

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-bahamut-tw', 'website', '巴哈姆特: 異環 (TW/HK)', 'https://forum.gamer.com.tw/B.php?bsn=80679', 'низкий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://forum.gamer.com.tw/B.php?bsn=80679');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-official-news-en', 'website', 'NTE: официальные новости EN', 'https://nte.perfectworld.com/en/article/news/', 'высокий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://nte.perfectworld.com/en/article/news/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-official-news-ru', 'website', 'NTE: официальные новости RU', 'https://nte.perfectworld.com/ru/article/news/', 'высокий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://nte.perfectworld.com/ru/article/news/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-official-news-jp', 'website', 'NTE: официальные новости JP', 'https://nte.perfectworld.com/jp/article/news/', 'высокий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://nte.perfectworld.com/jp/article/news/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-official-news-cn', 'website', 'NTE: официальные новости CN', 'https://nte.perfectworld.com/cn/article/news/', 'высокий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://nte.perfectworld.com/cn/article/news/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-neverness-gg-news', 'website', 'Neverness.gg: новости и события', 'https://neverness.gg/feed/', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://neverness.gg/feed/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-gematsu-news', 'website', 'Gematsu: Neverness to Everness', 'https://www.gematsu.com/tag/neverness-to-everness/feed', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://www.gematsu.com/tag/neverness-to-everness/feed');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-wotpack-news', 'website', 'Wotpack: NTE', 'https://wotpack.ru/?s=Neverness', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://wotpack.ru/?s=Neverness');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-4gamer-jp', 'website', '4Gamer: NTE 日本', 'https://www.4gamer.net/games/817/G081722/', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://www.4gamer.net/games/817/G081722/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-nevernesstoeverness', 'telegram', 'Neverness to Everness: RU сообщество', 'https://t.me/s/nevernesstoeverness', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/nevernesstoeverness');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-reddit-feed-nteleaks', 'website', 'Reddit r/NTELeaks: новые публикации', 'https://www.reddit.com/r/NTELeaks/new/', 'низкий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://www.reddit.com/r/NTELeaks/new/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-reddit-feed-nevernesstoeverness', 'website', 'Reddit r/NevernessToEverness: новые публикации', 'https://www.reddit.com/r/NevernessToEverness/new/', 'низкий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://www.reddit.com/r/NevernessToEverness/new/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-reddit-feed-gachagaming', 'website', 'Reddit r/gachagaming: новые публикации', 'https://www.reddit.com/r/gachagaming/new/', 'низкий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://www.reddit.com/r/gachagaming/new/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-official-jp-x', 'twitter/x', 'NTE 公式 X', 'https://x.com/NTE_JP', 'высокий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://x.com/NTE_JP');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-tieba-cn', 'website', 'Baidu Tieba: 异环', 'https://tieba.baidu.com/f?kw=%E5%BC%82%E7%8E%AF', 'низкий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://tieba.baidu.com/f?kw=%E5%BC%82%E7%8E%AF');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-ntewiki-news', 'website', 'NTE Wiki News', 'https://nte.wiki/news/', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://nte.wiki/news/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-icy-veins-nte-news', 'website', 'Icy Veins: NTE News', 'https://www.icy-veins.com/neverness-to-everness/', 'средний', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://www.icy-veins.com/neverness-to-everness/');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-loonaly', 'telegram', 'Loonaly NTE Leaks', 'https://t.me/s/loonaly_nte_leaks', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/loonaly_nte_leaks');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-donut', 'telegram', 'Donut Leaker (несколько игр)', 'https://t.me/s/donutleaker', 'низкий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/donutleaker');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-mainleakflow', 'telegram', 'MainLeakFlow (несколько игр)', 'https://t.me/s/mainleakflow_channel', 'низкий', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/mainleakflow_channel');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-seele-nte', 'telegram', 'Seele NTE Leaks', 'https://t.me/s/Seele_NTE_Leaks', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/Seele_NTE_Leaks');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-ru', 'telegram', 'Neverness to Everness RU', 'https://t.me/s/neverness_to_evernessru', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/neverness_to_evernessru');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-nte-grace-ru', 'telegram', 'NTE Grace / Neverness to Everness RU', 'https://t.me/s/Neverness_to_Everness_RU', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/Neverness_to_Everness_RU');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-telegram-nte-news-ru', 'telegram', 'NTE NEWS', 'https://t.me/s/NTENews', 'средний', 1
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://t.me/s/NTENews');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-bilibili-search', 'website', 'Bilibili: 异环 爆料', 'https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E7%88%86%E6%96%99', 'низкий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E7%88%86%E6%96%99');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-bilibili-future-search', 'website', 'Bilibili: 异环 未来版本 / 新角色', 'https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E6%9C%AA%E6%9D%A5%E7%89%88%E6%9C%AC%20%E6%96%B0%E8%A7%92%E8%89%B2', 'низкий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E6%9C%AA%E6%9D%A5%E7%89%88%E6%9C%AC%20%E6%96%B0%E8%A7%92%E8%89%B2');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-weibo-leak-search', 'website', 'Weibo: 异环 爆料', 'https://s.weibo.com/weibo?q=%23%E5%BC%82%E7%8E%AF%23%20%E7%88%86%E6%96%99', 'низкий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://s.weibo.com/weibo?q=%23%E5%BC%82%E7%8E%AF%23%20%E7%88%86%E6%96%99');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-weibo-future-search', 'website', 'Weibo: 异环 新角色 / 未公开', 'https://s.weibo.com/weibo?q=%E5%BC%82%E7%8E%AF%20%E6%96%B0%E8%A7%92%E8%89%B2%20%E6%9C%AA%E5%85%AC%E5%BC%80', 'низкий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://s.weibo.com/weibo?q=%E5%BC%82%E7%8E%AF%20%E6%96%B0%E8%A7%92%E8%89%B2%20%E6%9C%AA%E5%85%AC%E5%BC%80');

INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT 'discovery-official-global', 'twitter/x', 'NTE Global official', 'https://x.com/NTE_GL', 'высокий', 0
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = 'https://x.com/NTE_GL');

UPDATE sources SET auto_import_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 'leaks-telegram-nte' AND source_url = 'https://t.me/s/NTE_Neverness_to_Everness';

UPDATE sources SET auto_import_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = 'leaks-telegram-stardust' AND source_url = 'https://t.me/s/StardustLeaks';

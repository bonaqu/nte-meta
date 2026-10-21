-- Extend the reviewed registry; preserve existing editorial switches and trust.

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-bahamut-tw','website','巴哈姆特: 異環 (TW/HK)','https://forum.gamer.com.tw/B.php?bsn=80679','низкий',0,'zh','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://forum.gamer.com.tw/B.php?bsn=80679');

UPDATE sources SET language='zh',content_kind='news',parser='' WHERE source_url='https://forum.gamer.com.tw/B.php?bsn=80679' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-official-news-en','website','NTE: официальные новости EN','https://nte.perfectworld.com/en/article/news/','высокий',1,'en','news','official' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://nte.perfectworld.com/en/article/news/');

UPDATE sources SET language='en',content_kind='news',parser='official' WHERE source_url='https://nte.perfectworld.com/en/article/news/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-official-news-ru','website','NTE: официальные новости RU','https://nte.perfectworld.com/ru/article/news/','высокий',1,'ru','news','official' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://nte.perfectworld.com/ru/article/news/');

UPDATE sources SET language='ru',content_kind='news',parser='official' WHERE source_url='https://nte.perfectworld.com/ru/article/news/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-official-news-jp','website','NTE: официальные новости JP','https://nte.perfectworld.com/jp/article/news/','высокий',1,'ja','news','official' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://nte.perfectworld.com/jp/article/news/');

UPDATE sources SET language='ja',content_kind='news',parser='official' WHERE source_url='https://nte.perfectworld.com/jp/article/news/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-official-news-cn','website','NTE: официальные новости CN','https://nte.perfectworld.com/cn/article/news/','высокий',1,'zh','news','official' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://nte.perfectworld.com/cn/article/news/');

UPDATE sources SET language='zh',content_kind='news',parser='official' WHERE source_url='https://nte.perfectworld.com/cn/article/news/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-neverness-gg-news','website','Neverness.gg: новости и события','https://neverness.gg/feed/','средний',1,'en','news','feed' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://neverness.gg/feed/');

UPDATE sources SET language='en',content_kind='news',parser='feed' WHERE source_url='https://neverness.gg/feed/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-gematsu-news','website','Gematsu: Neverness to Everness','https://www.gematsu.com/tag/neverness-to-everness/feed','средний',1,'en','news','feed' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://www.gematsu.com/tag/neverness-to-everness/feed');

UPDATE sources SET language='en',content_kind='news',parser='feed' WHERE source_url='https://www.gematsu.com/tag/neverness-to-everness/feed' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-wotpack-news','website','Wotpack: NTE','https://wotpack.ru/?s=Neverness','средний',1,'ru','news','wordpress' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://wotpack.ru/?s=Neverness');

UPDATE sources SET language='ru',content_kind='news',parser='wordpress' WHERE source_url='https://wotpack.ru/?s=Neverness' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-4gamer-jp','website','4Gamer: NTE 日本','https://www.4gamer.net/games/817/G081722/','средний',1,'ja','news','articles' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://www.4gamer.net/games/817/G081722/');

UPDATE sources SET language='ja',content_kind='news',parser='articles' WHERE source_url='https://www.4gamer.net/games/817/G081722/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-nevernesstoeverness','telegram','Neverness to Everness: RU сообщество','https://t.me/s/nevernesstoeverness','средний',1,'ru','news','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/nevernesstoeverness');

UPDATE sources SET language='ru',content_kind='news',parser='telegram' WHERE source_url='https://t.me/s/nevernesstoeverness' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-reddit-feed-nteleaks','website','Reddit r/NTELeaks: новые публикации','https://www.reddit.com/r/NTELeaks/new/','низкий',1,'en','leak','reddit' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://www.reddit.com/r/NTELeaks/new/');

UPDATE sources SET language='en',content_kind='leak',parser='reddit' WHERE source_url='https://www.reddit.com/r/NTELeaks/new/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-reddit-feed-nevernesstoeverness','website','Reddit r/NevernessToEverness: новые публикации','https://www.reddit.com/r/NevernessToEverness/new/','низкий',1,'en','news','reddit' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://www.reddit.com/r/NevernessToEverness/new/');

UPDATE sources SET language='en',content_kind='news',parser='reddit' WHERE source_url='https://www.reddit.com/r/NevernessToEverness/new/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-reddit-feed-gachagaming','website','Reddit r/gachagaming: новые публикации','https://www.reddit.com/r/gachagaming/new/','низкий',1,'en','news','reddit' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://www.reddit.com/r/gachagaming/new/');

UPDATE sources SET language='en',content_kind='news',parser='reddit' WHERE source_url='https://www.reddit.com/r/gachagaming/new/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-official-jp-x','website','NTE 公式 X','https://x.com/NTE_JP','высокий',0,'ja','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://x.com/NTE_JP');

UPDATE sources SET language='ja',content_kind='news',parser='' WHERE source_url='https://x.com/NTE_JP' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-tieba-cn','website','Baidu Tieba: 异环','https://tieba.baidu.com/f?kw=%E5%BC%82%E7%8E%AF','низкий',0,'zh','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://tieba.baidu.com/f?kw=%E5%BC%82%E7%8E%AF');

UPDATE sources SET language='zh',content_kind='news',parser='' WHERE source_url='https://tieba.baidu.com/f?kw=%E5%BC%82%E7%8E%AF' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-ntewiki-news','website','NTE Wiki News','https://nte.wiki/news/','средний',1,'en','leak','ntewiki' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://nte.wiki/news/');

UPDATE sources SET language='en',content_kind='leak',parser='ntewiki' WHERE source_url='https://nte.wiki/news/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-icy-veins-nte-news','website','Icy Veins: NTE News','https://www.icy-veins.com/neverness-to-everness/','средний',0,'en','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://www.icy-veins.com/neverness-to-everness/');

UPDATE sources SET language='en',content_kind='news',parser='' WHERE source_url='https://www.icy-veins.com/neverness-to-everness/' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-loonaly','telegram','Loonaly NTE Leaks','https://t.me/s/loonaly_nte_leaks','средний',1,'ru','news','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/loonaly_nte_leaks');

UPDATE sources SET language='ru',content_kind='news',parser='telegram' WHERE source_url='https://t.me/s/loonaly_nte_leaks' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-donut','telegram','Donut Leaker (несколько игр)','https://t.me/s/donutleaker','низкий',1,'en','leak','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/donutleaker');

UPDATE sources SET language='en',content_kind='leak',parser='telegram' WHERE source_url='https://t.me/s/donutleaker' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-mainleakflow','telegram','MainLeakFlow (несколько игр)','https://t.me/s/mainleakflow_channel','низкий',1,'en','leak','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/mainleakflow_channel');

UPDATE sources SET language='en',content_kind='leak',parser='telegram' WHERE source_url='https://t.me/s/mainleakflow_channel' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-seele-nte','telegram','Seele NTE Leaks','https://t.me/s/Seele_NTE_Leaks','средний',1,'en','leak','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/Seele_NTE_Leaks');

UPDATE sources SET language='en',content_kind='leak',parser='telegram' WHERE source_url='https://t.me/s/Seele_NTE_Leaks' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-nanoka','telegram','nanoka.cc: обновления игровых данных','https://t.me/s/nanoka_news','низкий',1,'en','leak','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/nanoka_news');

UPDATE sources SET language='en',content_kind='leak',parser='telegram' WHERE source_url='https://t.me/s/nanoka_news' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-seele-main','telegram','Seele Leaks: NTE в общей ленте','https://t.me/s/Seele_Leaks','низкий',1,'zh','leak','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/Seele_Leaks');

UPDATE sources SET language='zh',content_kind='leak',parser='telegram' WHERE source_url='https://t.me/s/Seele_Leaks' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-galaxy','telegram','Galaxy Leak: NTE в общей ленте','https://t.me/s/galaxy_leak','низкий',1,'en','leak','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/galaxy_leak');

UPDATE sources SET language='en',content_kind='leak',parser='telegram' WHERE source_url='https://t.me/s/galaxy_leak' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-ru','telegram','Neverness to Everness RU','https://t.me/s/neverness_to_evernessru','средний',1,'ru','news','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/neverness_to_evernessru');

UPDATE sources SET language='ru',content_kind='news',parser='telegram' WHERE source_url='https://t.me/s/neverness_to_evernessru' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-nte-grace-ru','telegram','NTE Grace / Neverness to Everness RU','https://t.me/s/Neverness_to_Everness_RU','средний',1,'ru','news','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/Neverness_to_Everness_RU');

UPDATE sources SET language='ru',content_kind='news',parser='telegram' WHERE source_url='https://t.me/s/Neverness_to_Everness_RU' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-telegram-nte-news-ru','telegram','NTE NEWS','https://t.me/s/NTENews','средний',1,'ru','news','telegram' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://t.me/s/NTENews');

UPDATE sources SET language='ru',content_kind='news',parser='telegram' WHERE source_url='https://t.me/s/NTENews' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-bilibili-search','website','Bilibili: 异环 爆料','https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E7%88%86%E6%96%99','низкий',0,'zh','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E7%88%86%E6%96%99');

UPDATE sources SET language='zh',content_kind='news',parser='' WHERE source_url='https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E7%88%86%E6%96%99' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-bilibili-future-search','website','Bilibili: 异环 未来版本 / 新角色','https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E6%9C%AA%E6%9D%A5%E7%89%88%E6%9C%AC%20%E6%96%B0%E8%A7%92%E8%89%B2','низкий',0,'zh','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E6%9C%AA%E6%9D%A5%E7%89%88%E6%9C%AC%20%E6%96%B0%E8%A7%92%E8%89%B2');

UPDATE sources SET language='zh',content_kind='news',parser='' WHERE source_url='https://search.bilibili.com/all?keyword=%E5%BC%82%E7%8E%AF%20%E6%9C%AA%E6%9D%A5%E7%89%88%E6%9C%AC%20%E6%96%B0%E8%A7%92%E8%89%B2' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-weibo-leak-search','website','Weibo: 异环 爆料','https://s.weibo.com/weibo?q=%23%E5%BC%82%E7%8E%AF%23%20%E7%88%86%E6%96%99','низкий',0,'zh','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://s.weibo.com/weibo?q=%23%E5%BC%82%E7%8E%AF%23%20%E7%88%86%E6%96%99');

UPDATE sources SET language='zh',content_kind='news',parser='' WHERE source_url='https://s.weibo.com/weibo?q=%23%E5%BC%82%E7%8E%AF%23%20%E7%88%86%E6%96%99' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-weibo-future-search','website','Weibo: 异环 新角色 / 未公开','https://s.weibo.com/weibo?q=%E5%BC%82%E7%8E%AF%20%E6%96%B0%E8%A7%92%E8%89%B2%20%E6%9C%AA%E5%85%AC%E5%BC%80','низкий',0,'zh','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://s.weibo.com/weibo?q=%E5%BC%82%E7%8E%AF%20%E6%96%B0%E8%A7%92%E8%89%B2%20%E6%9C%AA%E5%85%AC%E5%BC%80');

UPDATE sources SET language='zh',content_kind='news',parser='' WHERE source_url='https://s.weibo.com/weibo?q=%E5%BC%82%E7%8E%AF%20%E6%96%B0%E8%A7%92%E8%89%B2%20%E6%9C%AA%E5%85%AC%E5%BC%80' AND language='unknown' AND parser='';

INSERT OR IGNORE INTO sources (id,source_type,source_name,source_url,trust_level,auto_import_enabled,language,content_kind,parser) SELECT 'discovery-official-global','website','NTE Global official','https://x.com/NTE_GL','высокий',0,'en','news','' WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url='https://x.com/NTE_GL');

UPDATE sources SET language='en',content_kind='news',parser='' WHERE source_url='https://x.com/NTE_GL' AND language='unknown' AND parser='';

-- Remove only the known malformed imported ability, preserving every other row.
UPDATE character_profiles SET abilities_json=(SELECT json_group_array(json(value)) FROM json_each(character_profiles.abilities_json) WHERE json_extract(value,'$.name') NOT LIKE 'Оставшееся время действия Реморы рассчитывается для каждой цели индивидуально.%') WHERE json_valid(abilities_json) AND EXISTS (SELECT 1 FROM json_each(character_profiles.abilities_json) WHERE json_extract(value,'$.name') LIKE 'Оставшееся время действия Реморы рассчитывается для каждой цели индивидуально.%');

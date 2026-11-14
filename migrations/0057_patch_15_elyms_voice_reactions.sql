-- Append official profile voice lines about Elyms from the 1.5 client.

-- Protect profiles modified after the observed catalog (2026-11-14 19:20:01 UTC).

UPDATE character_profiles
SET voice_lines_json = (
  SELECT json_group_array(json(value)) FROM (
    SELECT value FROM json_each(voice_lines_json)
    UNION ALL
    SELECT incoming.value FROM json_each('[{"id":"ja-Play_Vo_Char_NPC024_SSC_ELYMS_001","title":"Особое переключение - Элимс","language":"Японский","audioUrl":"/nte-meta/game-audio/a21167422307111ec7df.ogg","sourceUrl":"","description":"Эй, не сваливай на меня этот бардак!"},{"id":"en-Play_Vo_Char_NPC024_SSC_ELYMS_001","title":"Особое переключение - Элимс","language":"Английский","audioUrl":"/nte-meta/game-audio/3201659373abdc869c74.ogg","sourceUrl":"","description":"Эй, не сваливай на меня этот бардак!"},{"id":"zh-Play_Vo_Char_NPC024_about_002","title":"Об Элимсе","language":"Китайский","audioUrl":"/nte-meta/game-audio/2a415663049fdbf168ee.ogg","sourceUrl":"","description":"У меня всегда было ощущение, что… мы уже где-то встречались. Только я никак не мог понять, где. Однажды я спросил, не ходил ли он со мной в море несколько лет назад. Он только ответил: «Я?» Я опешил. Как такое можно забыть?"},{"id":"ja-Play_Vo_Char_NPC024_about_002","title":"Об Элимсе","language":"Японский","audioUrl":"/nte-meta/game-audio/7b788bcc0eebc80c997a.ogg","sourceUrl":"","description":"У меня всегда было ощущение, что… мы уже где-то встречались. Только я никак не мог понять, где. Однажды я спросил, не ходил ли он со мной в море несколько лет назад. Он только ответил: «Я?» Я опешил. Как такое можно забыть?"},{"id":"ko-Play_Vo_Char_NPC024_SSC_ELYMS_001","title":"Особое переключение - Элимс","language":"Корейский","audioUrl":"/nte-meta/game-audio/f03fb7ee3216b94233be.ogg","sourceUrl":"","description":"Эй, не сваливай на меня этот бардак!"},{"id":"en-Play_Vo_Char_NPC024_about_002","title":"Об Элимсе","language":"Английский","audioUrl":"/nte-meta/game-audio/e1fbea4b05ec0f1067bb.ogg","sourceUrl":"","description":"У меня всегда было ощущение, что… мы уже где-то встречались. Только я никак не мог понять, где. Однажды я спросил, не ходил ли он со мной в море несколько лет назад. Он только ответил: «Я?» Я опешил. Как такое можно забыть?"},{"id":"zh-Play_Vo_Char_NPC024_SSC_ELYMS_001","title":"Особое переключение - Элимс","language":"Китайский","audioUrl":"/nte-meta/game-audio/c62ebcb18fdcd1780c71.ogg","sourceUrl":"","description":"Эй, не сваливай на меня этот бардак!"},{"id":"ko-Play_Vo_Char_NPC024_about_002","title":"Об Элимсе","language":"Корейский","audioUrl":"/nte-meta/game-audio/b2a9031f3ea9a101c9d0.ogg","sourceUrl":"","description":"У меня всегда было ощущение, что… мы уже где-то встречались. Только я никак не мог понять, где. Однажды я спросил, не ходил ли он со мной в море несколько лет назад. Он только ответил: «Я?» Я опешил. Как такое можно забыть?"}]') incoming
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(voice_lines_json) old
      WHERE json_extract(old.value, '$.id') = json_extract(incoming.value, '$.id')
         OR json_extract(old.value, '$.audioUrl') = json_extract(incoming.value, '$.audioUrl')
    )
  )
)
WHERE character_id = 'chaos'
  AND updated_at <= '2026-11-14 19:20:01'
  AND json_array_length(voice_lines_json) <= 492
  AND EXISTS (
    SELECT 1 FROM characters
    WHERE id = character_id AND updated_at = '2026-11-05 21:41:33'
  );

UPDATE character_profiles
SET voice_lines_json = (
  SELECT json_group_array(json(value)) FROM (
    SELECT value FROM json_each(voice_lines_json)
    UNION ALL
    SELECT incoming.value FROM json_each('[{"id":"zh-Play_Vo_Char_NPC027_TeammateDown_003","title":"Поражён товарищ по команде – Элимс","language":"Китайский","audioUrl":"/nte-meta/game-audio/871fea5b752e498857a5.ogg","sourceUrl":"","description":"Сестрица Элимс, куда же ты пропала?.."},{"id":"zh-Play_Vo_Char_NPC027_SSC_Elyms_001","title":"Особое переключение - Элимс","language":"Китайский","audioUrl":"/nte-meta/game-audio/f4f7f426d86c517c244b.ogg","sourceUrl":"","description":"Сестрица Элимс… мы синхронизировались!"},{"id":"en-Play_Vo_Char_NPC027_about_003","title":"Об Элимсе","language":"Английский","audioUrl":"/nte-meta/game-audio/a1332cf4829b7ee299ac.ogg","sourceUrl":"","description":"Сестрица Элимс… Я так рада снова её видеть. Но её частоты теперь совсем другие, не такие, как раньше. Сейчас они похожи на кучу нестабильных каналов, наложенных друг на друга — мне даже трудно их разобрать… Когда мы опять встретились, я сперва приняла её за незнакомку, но она сразу меня узнала. Она даже вспомнила, как водила меня ловить Тамачи. И она всё так же любит тискать меня за щёчки, прямо как раньше… Похоже, частоты людей тоже могут меняться."},{"id":"en-Play_Vo_Char_NPC027_TeammateDown_003","title":"Поражён товарищ по команде – Элимс","language":"Английский","audioUrl":"/nte-meta/game-audio/16d620e87075f1304086.ogg","sourceUrl":"","description":"Сестрица Элимс, куда же ты пропала?.."},{"id":"zh-Play_Vo_Char_NPC027_about_003","title":"Об Элимсе","language":"Китайский","audioUrl":"/nte-meta/game-audio/1ef000ef4e88af1a9e0d.ogg","sourceUrl":"","description":"Сестрица Элимс… Я так рада снова её видеть. Но её частоты теперь совсем другие, не такие, как раньше. Сейчас они похожи на кучу нестабильных каналов, наложенных друг на друга — мне даже трудно их разобрать… Когда мы опять встретились, я сперва приняла её за незнакомку, но она сразу меня узнала. Она даже вспомнила, как водила меня ловить Тамачи. И она всё так же любит тискать меня за щёчки, прямо как раньше… Похоже, частоты людей тоже могут меняться."},{"id":"ko-Play_Vo_Char_NPC027_SSC_Elyms_001","title":"Особое переключение - Элимс","language":"Корейский","audioUrl":"/nte-meta/game-audio/17c6a600af40b05354c0.ogg","sourceUrl":"","description":"Сестрица Элимс… мы синхронизировались!"},{"id":"en-Play_Vo_Char_NPC027_SSC_Elyms_001","title":"Особое переключение - Элимс","language":"Английский","audioUrl":"/nte-meta/game-audio/48264ab64a162945a13c.ogg","sourceUrl":"","description":"Сестрица Элимс… мы синхронизировались!"},{"id":"ko-Play_Vo_Char_NPC027_about_003","title":"Об Элимсе","language":"Корейский","audioUrl":"/nte-meta/game-audio/b897afa8fa7fe81edd6b.ogg","sourceUrl":"","description":"Сестрица Элимс… Я так рада снова её видеть. Но её частоты теперь совсем другие, не такие, как раньше. Сейчас они похожи на кучу нестабильных каналов, наложенных друг на друга — мне даже трудно их разобрать… Когда мы опять встретились, я сперва приняла её за незнакомку, но она сразу меня узнала. Она даже вспомнила, как водила меня ловить Тамачи. И она всё так же любит тискать меня за щёчки, прямо как раньше… Похоже, частоты людей тоже могут меняться."},{"id":"ja-Play_Vo_Char_NPC027_SSC_Elyms_001","title":"Особое переключение - Элимс","language":"Японский","audioUrl":"/nte-meta/game-audio/ff6fadaa211b37062bc6.ogg","sourceUrl":"","description":"Сестрица Элимс… мы синхронизировались!"},{"id":"ja-Play_Vo_Char_NPC027_about_003","title":"Об Элимсе","language":"Японский","audioUrl":"/nte-meta/game-audio/9712312d99ed55676a3e.ogg","sourceUrl":"","description":"Сестрица Элимс… Я так рада снова её видеть. Но её частоты теперь совсем другие, не такие, как раньше. Сейчас они похожи на кучу нестабильных каналов, наложенных друг на друга — мне даже трудно их разобрать… Когда мы опять встретились, я сперва приняла её за незнакомку, но она сразу меня узнала. Она даже вспомнила, как водила меня ловить Тамачи. И она всё так же любит тискать меня за щёчки, прямо как раньше… Похоже, частоты людей тоже могут меняться."},{"id":"ja-Play_Vo_Char_NPC027_TeammateDown_003","title":"Поражён товарищ по команде – Элимс","language":"Японский","audioUrl":"/nte-meta/game-audio/e9e2b7cb9b06df77f234.ogg","sourceUrl":"","description":"Сестрица Элимс, куда же ты пропала?.."},{"id":"ko-Play_Vo_Char_NPC027_TeammateDown_003","title":"Поражён товарищ по команде – Элимс","language":"Корейский","audioUrl":"/nte-meta/game-audio/8c99c8596acae9212812.ogg","sourceUrl":"","description":"Сестрица Элимс, куда же ты пропала?.."}]') incoming
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(voice_lines_json) old
      WHERE json_extract(old.value, '$.id') = json_extract(incoming.value, '$.id')
         OR json_extract(old.value, '$.audioUrl') = json_extract(incoming.value, '$.audioUrl')
    )
  )
)
WHERE character_id = 'linko'
  AND updated_at <= '2026-11-14 19:20:01'
  AND json_array_length(voice_lines_json) <= 488
  AND EXISTS (
    SELECT 1 FROM characters
    WHERE id = character_id AND updated_at = '2026-10-21 03:56:00'
  );

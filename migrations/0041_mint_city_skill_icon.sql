-- Correct the known imported portrait used for Mint's city skill. Guard the
-- exact character, ability ID, title and old URL; custom media/text stay intact.
UPDATE character_profiles
SET abilities_json = json_set(
  abilities_json,
  (SELECT '$[' || e.key || '].iconUrl'
   FROM json_each(abilities_json) AS e
   WHERE json_extract(e.value, '$.id') = '1bd4a48a-146f-4658-a31d-23ce5e6e51b0'
     AND json_extract(e.value, '$.name') = 'Торнадо Минт'
     AND json_extract(e.value, '$.iconUrl') = 'https://i2.wp.com/images.genshin-builds.com/nte/characters/player_019.webp?strip=all&quality=100&w=520'
   LIMIT 1),
  '/nte-meta/game-assets/eb1adcc872b389762965.webp'
)
WHERE character_id = 'mint'
  AND EXISTS (
    SELECT 1 FROM json_each(abilities_json) AS e
    WHERE json_extract(e.value, '$.id') = '1bd4a48a-146f-4658-a31d-23ce5e6e51b0'
      AND json_extract(e.value, '$.name') = 'Торнадо Минт'
      AND json_extract(e.value, '$.iconUrl') = 'https://i2.wp.com/images.genshin-builds.com/nte/characters/player_019.webp?strip=all&quality=100&w=520'
  );

-- Correct two verified Hotori voice-cast labels without replacing other editor data.

UPDATE character_profiles
SET
  voice_actors_json = (
    SELECT json_group_array(
      json_object(
        'language',
        CASE
          WHEN json_extract(value, '$.name') LIKE '%Lee Ji-hyeon%'
            OR json_extract(value, '$.name') LIKE '%이지현%'
          THEN 'Корейский'
          ELSE json_extract(value, '$.language')
        END,
        'name',
        CASE
          WHEN json_extract(value, '$.name') = 'Lindsday Sheppard'
          THEN 'Lindsay Sheppard'
          ELSE json_extract(value, '$.name')
        END
      )
    )
    FROM json_each(character_profiles.voice_actors_json)
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE character_id = (
  SELECT id
  FROM characters
  WHERE slug = 'hotori' OR name = 'Хотори' OR original_name = 'Hotori'
  LIMIT 1
)
AND json_valid(voice_actors_json);

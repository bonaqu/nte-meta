-- Backfill verified profile metadata for Hotori without inventing playable audio.
-- Sources:
-- - NTE Wiki RU Hotori profile: Cosmos + Tverdoe arc type, birthday, faction.
-- - YouTube Voice Records stored only as source URLs, not direct audio files.

UPDATE character_profiles
SET
  arc_type = CASE
    WHEN trim(coalesce(arc_type, '')) = '' THEN 'Твёрдое'
    ELSE arc_type
  END,
  voice_lines_json = CASE
    WHEN voice_lines_json IS NULL OR voice_lines_json = '' OR voice_lines_json = '[]' THEN json_array(
      json_object(
        'id', 'hotori-voice-source-en',
        'title', 'Hotori Voice Records — Английский',
        'language', 'Английский',
        'audioUrl', '',
        'sourceUrl', 'https://www.youtube.com/watch?v=3kVJaEinOG0',
        'description', 'Видео-источник для ручной проверки реплик. Прямой аудиофайл редактор добавляет отдельно.'
      ),
      json_object(
        'id', 'hotori-voice-source-ja',
        'title', 'Hotori Voice Records — Японский',
        'language', 'Японский',
        'audioUrl', '',
        'sourceUrl', 'https://www.youtube.com/watch?v=3kVJaEinOG0',
        'description', 'Видео-источник для ручной проверки реплик. Прямой аудиофайл редактор добавляет отдельно.'
      ),
      json_object(
        'id', 'hotori-voice-source-ko',
        'title', 'Hotori Voice Records — Корейский',
        'language', 'Корейский',
        'audioUrl', '',
        'sourceUrl', 'https://www.youtube.com/watch?v=3kVJaEinOG0',
        'description', 'Видео-источник для ручной проверки реплик. Прямой аудиофайл редактор добавляет отдельно.'
      ),
      json_object(
        'id', 'hotori-voice-source-zh',
        'title', 'Hotori Voice Records — Китайский',
        'language', 'Китайский',
        'audioUrl', '',
        'sourceUrl', 'https://www.youtube.com/watch?v=3kVJaEinOG0',
        'description', 'Видео-источник для ручной проверки реплик. Прямой аудиофайл редактор добавляет отдельно.'
      )
    )
    ELSE voice_lines_json
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE character_id = (
  SELECT id
  FROM characters
  WHERE slug = 'hotori' OR name = 'Хотори' OR original_name = 'Hotori'
  LIMIT 1
);

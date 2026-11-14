-- Enrich observed published profiles from the validated local snapshot.
-- Preserve nonempty manual fields; skip characters edited after observation (2026-11-14 19:38:33 UTC).

UPDATE character_profiles SET birthday='13 ноября' WHERE character_id='zankou' AND updated_at<='2026-11-14 19:38:33' AND EXISTS(SELECT 1 FROM characters WHERE id=character_id AND updated_at='2026-10-21 03:56:00') AND trim(COALESCE(birthday, ''))='';

UPDATE character_profiles SET birthday='21 декабря' WHERE character_id='iroi' AND updated_at<='2026-11-14 19:38:33' AND EXISTS(SELECT 1 FROM characters WHERE id=character_id AND updated_at='2026-10-21 03:56:00') AND trim(COALESCE(birthday, ''))='';

UPDATE character_profiles SET birthday='14 февраля' WHERE character_id='linko' AND updated_at<='2026-11-14 19:38:33' AND EXISTS(SELECT 1 FROM characters WHERE id=character_id AND updated_at='2026-10-21 03:56:00') AND trim(COALESCE(birthday, ''))='';

UPDATE character_profiles SET birthday='1 янв.' WHERE character_id='chaos' AND updated_at<='2026-11-14 19:38:33' AND EXISTS(SELECT 1 FROM characters WHERE id=character_id AND updated_at='2026-11-05 21:41:33') AND trim(COALESCE(birthday, ''))='';

UPDATE character_profiles SET faction='Бюро по борьбе с аномалиями, ТОИ-6' WHERE character_id='chaos' AND updated_at<='2026-11-14 19:38:33' AND EXISTS(SELECT 1 FROM characters WHERE id=character_id AND updated_at='2026-11-05 21:41:33') AND trim(COALESCE(faction, ''))='';

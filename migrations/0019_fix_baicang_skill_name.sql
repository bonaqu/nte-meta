-- The saved second ability used a sub-form name. Keep editor changes intact and
-- only replace the exact known stale value with the verified Russian skill name.
UPDATE character_profiles
SET abilities_json = json_replace(
  abilities_json,
  '$[1].name',
  'Щедрое руководство'
)
WHERE character_id = 'baicang'
  AND json_valid(abilities_json)
  AND json_extract(abilities_json, '$[1].name') = 'Сердце неба и земли';

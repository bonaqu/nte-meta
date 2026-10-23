-- Official RU equipment names from the validated installed-client StringTables.
-- Replace only exact English item names; keep descriptions, stats, order and manual names.

-- ST_Fork::fork_PaperPlane_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Clear Skies' THEN json_set(value,'$.name','Чистое небо') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Clear Skies');

-- ST_Fork::fork_twinbirds_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Crime and Punishment' THEN json_set(value,'$.name','Преступление и наказание') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Crime and Punishment');

-- ST_Equipment::Suit_Incantation
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Crimson: Twin Butterflies' THEN json_set(value,'$.name','Багрянец: Две бабочки') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Crimson: Twin Butterflies');

-- ST_Equipment::Suit_Psyche
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Devil''s Blood: Curse' THEN json_set(value,'$.name','Кровь демона: Проклятие') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Devil''s Blood: Curse');

-- ST_Fork::fork_prism_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Far Side of the Moon' THEN json_set(value,'$.name','Обратная сторона Луны') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Far Side of the Moon');

-- ST_Equipment::Suit_Nature
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Fireflies and the Forest' THEN json_set(value,'$.name','Светлячки и лес') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Fireflies and the Forest');

-- ST_Fork::fork_ThiefCandy_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Fluff of Finesse' THEN json_set(value,'$.name','Пух изящества') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Fluff of Finesse');

-- ST_Fork::fork_MotorCandy_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Fluff of Fleetness' THEN json_set(value,'$.name','Пух проворности') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Fluff of Fleetness');

-- ST_Equipment::Suit_Cosmos
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Lost Radiance' THEN json_set(value,'$.name','Утраченное сияние') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Lost Radiance');

-- ST_Fork::fork_Time_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Marching Beyond Time' THEN json_set(value,'$.name','За пределы времени') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Marching Beyond Time');

-- ST_Fork::fork_DemonBlade_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Ravenous Blade' THEN json_set(value,'$.name','Ненасытный клинок') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Ravenous Blade');

-- ST_Fork::fork_TigerTally_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Ready-Ready' THEN json_set(value,'$.name','Полная готовность') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Ready-Ready');

-- ST_Equipment::Suit_Attack
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Shadow Creed' THEN json_set(value,'$.name','Кредо теней') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Shadow Creed');

-- ST_Equipment::Suit_GetEfficiency
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Speedy Hedgehog' THEN json_set(value,'$.name','Скоростной ёж') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Speedy Hedgehog');

-- ST_Equipment::Suit_Lakshana
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Street Boxer' THEN json_set(value,'$.name','Уличный боец') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Street Boxer');

-- ST_Fork::fork_worldrain_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='The Rain That Shook the World' THEN json_set(value,'$.name','Дождь, сотрясший мир') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='The Rain That Shook the World');

-- ST_Fork::fork_Door_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='The Wrong Gate' THEN json_set(value,'$.name','Неверные врата') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='The Wrong Gate');

-- ST_Fork::fork_GoldRecord_name
UPDATE guide_sections SET meta_json=json_set(meta_json,'$.visual.items',json((SELECT json_group_array(json(CASE WHEN json_extract(value,'$.name')='Voice of the Voyager' THEN json_set(value,'$.name','Голос странника') ELSE value END)) FROM json_each(meta_json,'$.visual.items')))) WHERE json_extract(meta_json,'$.visual.kind') IN ('arcs','cartridges') AND EXISTS(SELECT 1 FROM json_each(meta_json,'$.visual.items') WHERE json_extract(value,'$.name')='Voice of the Voyager');

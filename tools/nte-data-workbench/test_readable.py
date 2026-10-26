import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from readable import category, export_readable, safe, skill_cost_sections


class ReadableTests(unittest.TestCase):
    def test_skill_costs_have_names_levels_and_exact_totals(self):
        progression = {'items': {'gold': {'name': 'Жук-монета', 'iconUrl': 'coin.webp'}}}
        option = {'skills': [{'id': 'GA_Test', 'type': 'melee', 'kind': 'combat', 'stages': [
            {'level': '2', 'fromLevel': 1, 'items_id': ['gold'], 'amount': [2000]},
            {'level': '3', 'fromLevel': 2, 'items_id': ['gold'], 'amount': [5000]},
        ]}]}
        profile = {'abilities': [{'id': 'GA_Test_name', 'type': 'Базовая атака', 'name': 'Избавление'}]}
        sections = skill_cost_sections(option, profile, progression)
        self.assertEqual(sections[0]['name'], 'Избавление')
        self.assertEqual(sections[0]['totals'], [('Жук-монета', 7000, 'coin.webp')])
        self.assertEqual(sections[0]['stages'][0], (1, '2', 'Жук-монета', 2000))
        with self.assertRaises(ValueError): skill_cost_sections(option, profile, {'items': {}})

    def test_player_sections_named_playable_media_and_safe_workbook(self):
        from PIL import Image
        from openpyxl import load_workbook
        ffmpeg = shutil.which('ffmpeg')
        self.assertIsNotNone(ffmpeg, 'Use the installed shared FFmpeg')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); repo = root / 'repo'; out = root / 'out'
            (repo / 'public/game-assets').mkdir(parents=True)
            (repo / 'public/game-audio').mkdir(parents=True)
            Image.new('RGB', (4, 4), 'red').save(repo / 'public/game-assets/icon.webp')
            audio = repo / 'public/game-audio/voice.ogg'
            subprocess.run([ffmpeg, '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.15', '-c:a', 'libopus', str(audio)], check=True)
            profile = {
                'biography': 'Доставщица из Хетэро.',
                'baseStats': [{'label': 'АТК', 'value': '81'}],
                'abilities': [{'name': 'Быстрая доставка', 'type': 'Базовая атака', 'iconUrl': '/nte-meta/game-assets/icon.webp', 'description': 'Наносит урон.', 'attributes': [{'label': 'Урон', 'value': '1: 24% · 2: 26%'}]}],
                'awakenings': [{'name': 'Удвоенная вместимость', 'kind': 'resonance', 'level': 3, 'description': 'Уровень навыков +1', 'iconUrl': '/nte-meta/game-assets/icon.webp'}],
                'materials': [{'name': 'Жук-монета', 'quantity': '25000', 'source': '20 → 30'}],
                'friendship': [{'level': 1, 'description': 'Опыт симпатии: 100', 'rewards': [{'name': 'Аннулит', 'quantity': '10'}]}],
                'gifts': [{'name': 'Кофе', 'effect': 'Симпатия +100'}],
                'skins': [{'name': 'Двухцветные шипы', 'description': 'Куртка', 'imageUrl': '/nte-meta/game-assets/icon.webp'}],
                'voiceLines': [{'id': 'en-voice_event', 'title': 'Подарок получен I', 'description': 'Спасибо!', 'language': 'Английский', 'audioUrl': '/nte-meta/game-audio/voice.ogg'}],
            }
            records = [
                {'namespace': 'NTE_ReferenceItem', 'gameId': 'CharacterUpMaterial_lv1', 'values': {'ru': 'Книга опыта', 'en': 'Experience Book'}, 'details': {'context': 'Grants experience'}, 'assets': [{'url': '/nte-meta/game-assets/icon.webp'}]},
                {'namespace': 'ST_Item', 'gameId': 'book_context', 'values': {'ru': 'Даёт опыт персонажу.', 'en': 'Grants experience'}, 'details': {}, 'assets': []},
                {'namespace': 'NTE_ProfileVoice', 'kind': 'audio', 'ownerId': '1025', 'gameId': 'voice_event', 'values': {}, 'details': {'locale': 'en'}, 'assets': [{'url': '/nte-meta/game-audio/voice.ogg'}]},
            ]
            records.extend({'namespace': 'UI', 'kind': 'image', 'gameId': str(i), 'values': {}, 'details': {}, 'assets': [{'url': '/nte-meta/game-assets/icon.webp', 'path': 'HT/Content/UI/icon.uasset'}]} for i in range(101))
            data = {'characters': [{'ownerId': '1025', 'name': 'Хатор', 'values': {'ru': 'Хатор', 'en': 'Hathor', 'ja': 'ハソール', 'zh': '哈索尔'}, 'profile': profile}], 'equipment': [], 'progression': {'costs': [], 'characterExp': []}}
            data['progression']['items'] = {'gold': {'name': 'Жук-монета', 'iconUrl': '/nte-meta/game-assets/icon.webp'}}
            data['progression']['costs'] = [{'id': '1025', 'kind': 'character', 'stages': [], 'skills': [
                {'id': 'basic', 'type': 'melee', 'kind': 'combat', 'stages': [
                    {'level': '2', 'fromLevel': 1, 'items_id': ['gold'], 'amount': [2000]},
                    {'level': '3', 'fromLevel': 2, 'items_id': ['gold'], 'amount': [5000]},
                ]},
            ]}]
            result = export_readable(repo, out, {'1025': 'Хатор'}, lambda: iter(records), True, lambda _: None, data=data)
            self.assertEqual(result, {'characters': 1, 'equipment': 0, 'items': 1, 'mp3': 1, 'png': 1})
            folder = out / 'Для игрока/Персонажи/1025 — Хатор'
            self.assertIn('Доставщица из Хетэро.', (folder / '01 — Биография.html').read_text(encoding='utf-8'))
            self.assertIn('Удвоенная вместимость', (folder / '04 — Пробуждения и резонанс.html').read_text(encoding='utf-8'))
            self.assertIn('Спасибо!', (folder / '08 — Озвучка.html').read_text(encoding='utf-8'))
            self.assertIn('Всего для этого навыка', (folder / '05 — Прокачка.html').read_text(encoding='utf-8'))
            mp3 = next((folder / 'Медиа/Озвучка/Английский').glob('Подарок получен I*.mp3'))
            subprocess.run([ffmpeg, '-v', 'error', '-i', str(mp3), '-f', 'null', '-'], check=True, capture_output=True)
            png = next((folder / 'Медиа/Изображения').glob('Гардероб*.png'))
            with Image.open(png) as image: self.assertEqual(image.format, 'PNG')
            self.assertIn('Даёт опыт персонажу.', (out / 'Для игрока/Предметы/Развитие/Опыт персонажа/Каталог.html').read_text(encoding='utf-8'))
            self.assertTrue((out / 'Для игрока/Медиатека/Общий интерфейс и прочие изображения/Страница 2.html').is_file())
            workbook = load_workbook(out / 'Для игрока/NTE — для игрока.xlsx')
            self.assertEqual(workbook['Характеристики']['C2'].value, '81')
            self.assertEqual(workbook['Характеристики'].auto_filter.ref, 'A1:C2')
            self.assertEqual(workbook['Характеристики']['C2'].data_type, 's')
            self.assertIsNotNone(workbook['Реплики']['E2'].hyperlink)
            self.assertEqual(workbook['Итоги навыков']['F2'].value, '7000')
            self.assertEqual(workbook['Прокачка навыков']['E2'].value, '2')
            workbook.close()

    def test_categories_follow_actual_item_types_and_material_ids(self):
        self.assertFalse(safe('x'*75+' '+ 'long').endswith(' '))
        self.assertEqual(category({'gameId': 'WeaponBreakMaterial_01', 'namespace': 'NTE_ReferenceItem', 'details': {}}), 'Развитие/Возвышение дуги')
        self.assertEqual(category({'gameId': 'food_01', 'namespace': 'NTE_ReferenceItem', 'details': {'type_id': 'ITEM_TYPE_CONSUMABLE'}}), 'Кулинария/Еда и напитки')
        self.assertEqual(category({'gameId': 'Worldboss_material_06', 'namespace': 'NTE_ReferenceItem', 'details': {}}), 'Развитие/Материалы мировых боссов')
        self.assertEqual(category({'gameId': 'unknown', 'namespace': 'NTE_ReferenceItem', 'details': {}}), 'Прочие предметы')


if __name__ == '__main__': unittest.main()

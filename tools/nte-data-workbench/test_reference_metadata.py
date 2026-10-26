import sys
from pathlib import Path
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/game-data'))
from reference_metadata import ability_menu


class ReferenceMetadataTests(TestCase):
    def test_numeric_skill_costs_survive_without_copying_descriptions(self):
        ability = dict(id='GA_Test', type='melee', ability_type='Proactive', phases=['private prose'], materials=[
            dict(level='2', require_breakthrough_level=2, items_id=['gold', 'item'], amount=[2000, 2]),
        ])
        self.assertEqual(ability_menu([ability]), [{
            'id': 'GA_Test', 'type': 'melee', 'ability_type': 'Proactive', 'materials': ability['materials'],
        }])
        self.assertEqual(ability_menu([dict(id='passive')]), [dict(id='passive')])

    def test_invalid_cost_does_not_produce_a_partial_total(self):
        valid = dict(level='2', items_id=['gold'], amount=[2000])
        for invalid in [dict(valid, amount=[-1]), dict(valid, amount=[True]),
                        dict(valid, amount=[float('nan')]), dict(valid, amount=[]),
                        dict(valid, amount=[1.5]), dict(valid, level='21')]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                ability_menu([dict(id='test', materials=[valid, invalid])])
        with self.assertRaises(ValueError):
            ability_menu([dict(id='test', materials=[valid, valid])])

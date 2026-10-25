"""Offline regression for renamed native profile tables. Set NTE_EXTRACTOR_DLL."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class VoiceBindingsTest(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('NTE_EXTRACTOR_DLL'), 'Built extractor required')
    def test_row_owner_survives_retired_asset_filename(self):
        def event(name):
            return {'AudioEvent': {'AssetPathName': f'/Game/WwiseAudio/Events/Voice/{name}.{name}'}}
        female = event('Play_Vo_Char_ZERO_F_ug_001')
        data = [{'Rows': {
            '1051': {'DailyContent': [female, female]},
            '1046': {'DailyContent': [event('Play_Vo_Char_ZERO_M_ug_001')]},
            'None': {'DailyContent': [event('Play_Vo_Char_UNKNOWN_ug_001')]},
        }}]
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / '1009FileDataTable.json'
            source.write_text(json.dumps(data), encoding='utf-8')
            result = subprocess.run(['dotnet', os.environ['NTE_EXTRACTOR_DLL'], '--profile-voices', str(source)], check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout), [
            {'OwnerId': '1046', 'EventName': 'Play_Vo_Char_ZERO_M_ug_001'},
            {'OwnerId': '1051', 'EventName': 'Play_Vo_Char_ZERO_F_ug_001'},
        ])


if __name__ == '__main__':
    unittest.main()

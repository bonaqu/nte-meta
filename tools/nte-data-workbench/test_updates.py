import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
from updates import snapshot_folder, compare_archives, profile_migration
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/game-data'))
from media_cache import media_name


class UpdateTests(TestCase):
    def test_media_cache_changes_url_when_payload_changes(self):
        path='HT/Content/WwiseAudio/Media/English/42.wem'
        cache={path.lower():dict(sha256='old',name='a'*20+'.ogg')}
        self.assertEqual(media_name(path,'old',cache,'ogg'),'a'*20+'.ogg')
        self.assertNotEqual(media_name(path,'new',cache,'ogg'),'a'*20+'.ogg')
        self.assertEqual(media_name(path,'new',cache,'ogg'),media_name(path,'new',{},'ogg'))
        cache[path.lower()]['name']='../../other.ogg'
        self.assertNotIn('/',media_name(path,'old',cache,'ogg'))
    def test_incomplete_snapshot_is_never_selected(self):
        with TemporaryDirectory() as directory:
            root=Path(directory)
            for name,status in [('01','complete'),('02','running')]:
                folder=root/name
                (folder/'export').mkdir(parents=True)
                (folder/'export/extraction.json').write_text('{}')
                (folder/'extraction-status.json').write_text(json.dumps({'status':status}))
            self.assertEqual(snapshot_folder(root),root/'01')
            with self.assertRaises(ValueError):snapshot_folder(root/'02')

    def test_archive_change_and_timestamp_precision(self):
        old=[dict(folder='TagPatchPaks',name='English.pak',bytes=100,modifiedUtc='2026-10-25T18:00:00.1234567Z')]
        current=[dict(old[0],modifiedUtc='2026-10-25T18:00:00.123456+00:00')]
        self.assertFalse(any(compare_archives(current,old).values()))
        current[0]['bytes']=101
        self.assertEqual(len(compare_archives(current,old)['changed']),1)

    def test_repeat_preparation_reuses_only_untracked_migration(self):
        with TemporaryDirectory() as directory:
            root=Path(directory); (root/'migrations').mkdir()
            (root/'migrations/0001_base.sql').write_text('-- base')
            output=profile_migration(root,root);output.write_text('-- prepared')
            with patch('updates.subprocess.run',return_value=SimpleNamespace(returncode=1)):
                self.assertEqual(profile_migration(root,root),output)
            with patch('updates.subprocess.run',return_value=SimpleNamespace(returncode=0)):
                self.assertEqual(profile_migration(root,root).name,'0003_native_profile_update.sql')

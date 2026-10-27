import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
from unittest import skipUnless
import os
import shutil
import subprocess
from unittest.mock import patch
from updates import snapshot_folder, compare_archives, profile_migration, reuse_snapshot_files
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/game-data'))
from media_cache import media_name


class UpdateTests(TestCase):
    @skipUnless(os.name == 'nt' and shutil.which('pwsh'), 'NTFS junction lifecycle is checked on Windows')
    def test_incompatible_archives_mark_failed_and_unlink_only_mount(self):
        with TemporaryDirectory() as directory:
            root=Path(directory); content=root/'game/Client/WindowsNoEditor/HT/Content'
            for name in ['Paks','PatchPaks','TagPatchPaks']:(content/name).mkdir(parents=True)
            original=content/'Paks/fixture.pak';original.write_bytes(b'untouched game')
            key=root/'key.txt';key.write_text('0'*64)
            tool=root/'mock-extractor.cmd'
            tool.write_text('@echo No valid files found. Archives may be encrypted with a different AES key.\n@exit /b 1\n')
            mapping=root/'test.usmap';mapping.write_bytes(b'fixture')
            output=root/'extracts'
            result=subprocess.run(['pwsh','-NoProfile','-File',str(Path(__file__).resolve().parents[2]/'scripts/game-data/extract-local.ps1'),
                '-GameDirectory',str(root/'game'),'-Tool',str(tool),'-Mapping',str(mapping),'-ArchiveKeyFile',str(key),'-Output',str(output)],
                capture_output=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
            self.assertNotEqual(result.returncode,0)
            snapshot=next(output.iterdir())
            status=json.loads((snapshot/'extraction-status.json').read_text('utf-8-sig'))
            self.assertEqual(status['status'],'failed');self.assertTrue(status['compatibilityError'])
            self.assertEqual(original.read_bytes(),b'untouched game')
            self.assertFalse((snapshot/'mount/HT/Content/Paks').exists())
            with self.assertRaises(ValueError):snapshot_folder(output)

    def test_incremental_export_reuses_identical_payloads_but_preserves_old_versions(self):
        with TemporaryDirectory() as directory:
            old,new=Path(directory)/'old',Path(directory)/'new'
            for folder in [old,new]:
                (folder/'export/tables').mkdir(parents=True)
                (folder/'export/audio/English').mkdir(parents=True)
                (folder/'export/extraction.json').write_text('{}')
                (folder/'export/media-cache.json').write_text('{}')
                (folder/'export/tables/same.json').write_text('{"name":"same"}')
            (old/'export/audio/English/42.wem').write_bytes(b'old voice')
            (new/'export/audio/English/42.wem').write_bytes(b'new voice')
            (new/'export/tables/added.json').write_text('{"name":"new character"}')
            result=reuse_snapshot_files(new,old)
            self.assertEqual((result['reused'],result['changed'],result['added']),(1,1,1))
            self.assertTrue((old/'export/tables/same.json').samefile(new/'export/tables/same.json'))
            self.assertFalse((old/'export/media-cache.json').samefile(new/'export/media-cache.json'))
            self.assertEqual((old/'export/audio/English/42.wem').read_bytes(),b'old voice')
            self.assertEqual((new/'export/audio/English/42.wem').read_bytes(),b'new voice')
            with self.assertRaises(ValueError):reuse_snapshot_files(old,old)

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

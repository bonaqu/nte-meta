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
    def test_repeated_failed_runs_keep_separate_snapshots_and_cleanup_preparation(self):
        with TemporaryDirectory() as directory:
            root=Path(directory); content=root/'game/Client/WindowsNoEditor/HT/Content'
            for name in ['Paks','PatchPaks','TagPatchPaks']:(content/name).mkdir(parents=True)
            original=content/'Paks/fixture.pak';original.write_bytes(b'untouched game')
            key=root/'key.txt';key.write_text('0'*64)
            mapping=root/'test.usmap';mapping.write_bytes(b'fixture')
            tool=root/'mock.cmd';tool.write_text('@echo Provider initialized. Found 0 virtual files.\n@echo No valid files found\n@exit /b 1\n')
            output=root/'extracts'
            script=Path(__file__).resolve().parents[2]/'scripts/game-data/extract-local.ps1'
            # Force an identical clock value: even two starts in one tick must
            # create separate diagnostic snapshots, never overwrite old files.
            wrapper=root/'repeat.ps1'
            wrapper.write_text('param($script,$game,$tool,$mapping,$key,$output)\n'
                'function Get-Date {param($Format) "20261027T1200000000000"}\n'
                'foreach($attempt in 1..2){try { & $script -GameDirectory $game -Tool $tool -Mapping $mapping -ArchiveKeyFile $key -Output $output } catch {}}\n')
            result=subprocess.run(['pwsh','-NoProfile','-File',str(wrapper),str(script),str(root/'game'),str(tool),str(mapping),str(key),str(output)],
                capture_output=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
            self.assertEqual(result.returncode,0,result.stderr)
            snapshots=list(output.iterdir());self.assertEqual(len(snapshots),2)
            for snapshot in snapshots:
                self.assertEqual(json.loads((snapshot/'extraction-status.json').read_text('utf-8-sig'))['status'],'failed')
                self.assertFalse((snapshot/'mount/HT/Content/Paks').exists())
            # A setup error after the first junction must clean that junction,
            # too; the original archive is never removed or traversed.
            (content/'PatchPaks').rmdir()
            failed=subprocess.run(['pwsh','-NoProfile','-File',str(script),'-GameDirectory',str(root/'game'),'-Tool',str(tool),
                '-Mapping',str(mapping),'-ArchiveKeyFile',str(key),'-Output',str(output)],capture_output=True,
                encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
            self.assertNotEqual(failed.returncode,0)
            self.assertEqual(len(list(output.iterdir())),3)
            for snapshot in output.iterdir():self.assertFalse((snapshot/'mount/HT/Content/Paks').exists())
            self.assertEqual(original.read_bytes(),b'untouched game')
            # Invalid input is rejected before creating a run or any junction.
            key.write_text('invalid')
            invalid=subprocess.run(['pwsh','-NoProfile','-File',str(script),'-GameDirectory',str(root/'game'),'-Tool',str(tool),
                '-Mapping',str(mapping),'-ArchiveKeyFile',str(key),'-Output',str(output)],capture_output=True,
                encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
            self.assertNotEqual(invalid.returncode,0)
            self.assertEqual(len(list(output.iterdir())),3)

    @skipUnless(os.name == 'nt' and shutil.which('pwsh'), 'NTFS junction lifecycle is checked on Windows')
    def test_incompatible_archives_mark_failed_and_unlink_only_mount(self):
        with TemporaryDirectory() as directory:
            root=Path(directory); content=root/'game/Client/WindowsNoEditor/HT/Content'
            for name in ['Paks','PatchPaks','TagPatchPaks']:(content/name).mkdir(parents=True)
            original=content/'Paks/fixture.pak';original.write_bytes(b'untouched game')
            key=root/'key.txt';key.write_text('0'*64)
            tool=root/'mock-extractor.cmd'
            tool.write_text('@echo Provider initialized. Found 0 virtual files.\n@echo No valid files found. Archives may be encrypted with a different AES key.\n@exit /b 1\n')
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

    @skipUnless(os.name == 'nt' and shutil.which('pwsh'), 'Native process retries are checked on Windows')
    def test_archive_startup_retry_is_bounded_and_never_retries_unrelated_failure(self):
        with TemporaryDirectory() as directory:
            root=Path(directory)
            script=Path(__file__).resolve().parents[2]/'scripts/game-data/extract-local.ps1'
            wrapper=root/'invoke.ps1'
            wrapper.write_text('param($source,$tool,$mode,$counter,$log)\n'
                '$tokens=$null;$errors=$null\n'
                '$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)\n'
                '$definition=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq "Invoke-ArchiveCommand"},$true)\n'
                '. ([ScriptBlock]::Create($definition.Extent.Text))\n'
                '$script:compatibilityError=$false;$failed=$false\n'
                'try {Invoke-ArchiveCommand -Executable $tool -Arguments @($mode,$counter) -Log $log | Out-Null} catch {$failed=$true}\n'
                '@{count=[int](Get-Content -LiteralPath $counter);failed=$failed;archiveReadFailure=$script:compatibilityError} | ConvertTo-Json -Compress\n')
            tool=root/'reader.cmd'
            tool.write_text('@echo off\nset /p count=<"%~2"\nset /a count+=1\n>"%~2" echo %count%\n'
                'if "%~1"=="other" (echo Invalid mapping format& exit /b 2)\n'
                'if "%~1"=="recover" if %count% GEQ 2 (echo Provider initialized. Found 929060 virtual files.& exit /b 0)\n'
                'echo Provider initialized. Found 0 virtual files.\necho No valid files found\nexit /b 1\n')
            for mode,count,failed,archive_error in [('recover',2,False,False),('always',3,True,True),('other',1,True,False)]:
                with self.subTest(mode=mode):
                    counter=root/(mode+'.txt');counter.write_text('0')
                    log=root/(mode+'.log')
                    result=subprocess.run(['pwsh','-NoProfile','-File',str(wrapper),str(script),str(tool),mode,str(counter),str(log)],
                        capture_output=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
                    self.assertEqual(result.returncode,0,result.stderr)
                    self.assertEqual(json.loads(result.stdout),dict(count=count,failed=failed,archiveReadFailure=archive_error))
                    self.assertEqual(len(list(root.glob(mode+'.log.attempt-*.log'))),count)

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

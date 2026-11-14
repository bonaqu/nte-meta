import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase

from patch_report import write_report


class ReportTests(TestCase):
    def test_reports_native_delta_and_escapes_names(self):
        def item(id, hash, details=None):
            return dict(originalId=id, sourceHash=hash, kind='arc', namespace='ST_Fork',
                        gameId=id, ownerId='', values={'ru': '<Новая дуга>'}, term=True,
                        details=details or {})
        with TemporaryDirectory() as directory:
            folder = Path(directory)
            old, new = folder/'old.gz', folder/'new.gz'
            for path, rows in [(old, [item('changed','1'), item('removed','1')]),
                               (new, [item('changed','2'), item('new','1'),
                                      item('third-party','1', {'reference': {'provider':'ref'}})])]:
                with gzip.open(path,'wt',encoding='utf-8') as stream:
                    stream.write(json.dumps({'records':rows}))
            result = write_report(old,new,folder)
            for key in ('added','removed','changed'):
                self.assertEqual(result[key],{'arc':1})
            self.assertEqual(len(result['noteworthy']),2)
            self.assertIn('&lt;Новая дуга&gt;', (folder/'Изменения патча.html').read_text('utf-8'))

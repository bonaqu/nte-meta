import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


@unittest.skipUnless(os.name == 'nt', 'The workbench is a Windows desktop app')
class AppTests(unittest.TestCase):
    def test_every_path_and_action_has_help_and_tooltip_opens(self):
        import app
        with tempfile.TemporaryDirectory() as temporary, patch.object(app, 'SETTINGS', Path(temporary) / 'settings.json'):
            window = app.Workbench()
            try:
                window.withdraw(); window.geometry('760x680'); window.update_idletasks()
                self.assertEqual(len(window.tooltips), 27)
                self.assertTrue(all(len(t.text) > 80 for t in window.tooltips))
                hint = window.tooltips[0]
                hint.enter(); hint.hide(); hint.show(); window.update_idletasks()
                self.assertIsNotNone(hint.window)
                self.assertEqual(window.help_text.get(), hint.text)
                hint.hide(); self.assertIsNone(hint.window)
                self.assertEqual(window.last_output, '')
            finally: window.destroy()

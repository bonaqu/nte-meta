import importlib.util
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, skipUnless
from unittest.mock import patch


@skipUnless(os.name == 'nt' and importlib.util.find_spec('PySide6'), 'Desktop Qt runtime is optional on CI')
class DesktopTests(TestCase):
    def test_editor_is_isolated_from_local_tools_and_uses_selected_storage(self):
        import desktop
        from PySide6.QtWidgets import QApplication
        from PySide6.QtCore import QUrl, QCoreApplication, QEvent, QEventLoop, QTimer
        from PySide6.QtWebEngineCore import QWebEnginePage
        application = QApplication.instance() or QApplication([])
        with TemporaryDirectory() as directory, patch.object(desktop, 'DATA', Path(directory)):
            window = desktop.Desktop()
            try:
                window.hide()
                self.assertEqual(Path(window.profile.cachePath()), Path(directory)/'cache')
                self.assertIsNone(window.page.webChannel())
                kind = QWebEnginePage.NavigationType.NavigationTypeOther
                self.assertFalse(window.page.acceptNavigationRequest(QUrl('file:///C:/Windows/'), kind, True))
                self.assertFalse(window.page.acceptNavigationRequest(QUrl('https://example.com/'), kind, True))
                self.assertTrue(window.page.acceptNavigationRequest(QUrl(desktop.site_url('/guides')), kind, True))
                with self.assertRaises(ValueError): desktop.site_url('javascript:alert(1)')
                self.assertEqual(len(window.nav), 7)
            finally:
                window.close(); application.processEvents()
                QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
                application.processEvents()
                # Chromium completes its profile shutdown asynchronously.
                loop = QEventLoop(); QTimer.singleShot(300, loop.quit); loop.exec()

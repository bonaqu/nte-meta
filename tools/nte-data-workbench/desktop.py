"""Desktop editorial workspace. Remote pages have no bridge to local Python."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import threading

from PySide6.QtCore import QObject, QTimer, QUrl, Signal, QLockFile
from PySide6.QtGui import QDesktopServices, QIcon
from PySide6.QtWidgets import (QApplication, QFileDialog, QFrame, QHBoxLayout, QLabel,
    QMainWindow, QMessageBox, QProgressBar, QPushButton, QStackedWidget, QVBoxLayout, QWidget)
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView

from app import DEFAULTS, REPOSITORY, SETTINGS
from updates import check_update

SITE = 'https://bonaqu.github.io/nte-meta/'
DATA = Path(r'E:\CODEX - IMPORT HERE TEMP FILES AND OTHER\nte-meta\desktop')
SECTIONS = [('Новости и слухи', '/'), ('Гайды', '/guides'), ('Персонажи и биографии', '/characters'),
            ('Тир-листы', '/tierlists'), ('База игры', '/admin/game-data'), ('Мой профиль', '/profile')]
ACTIONS = {'extract': 'Извлечь обновление', 'normalize': 'Подготовить снимок',
           'export_data': 'Экспорт Excel / JSON / медиа', 'prepare_characters': 'Подготовить персонажей',
           'publish_data': 'Опубликовать игровые данные'}


def config():
    result = dict(DEFAULTS)
    if SETTINGS.is_file():
        saved = json.loads(SETTINGS.read_text('utf-8'))
        result.update({k: v for k, v in saved.items() if k in result and isinstance(v, str)})
    return result


def site_url(path):
    if path not in {route for _, route in SECTIONS}: raise ValueError('Неизвестный раздел сайта')
    return SITE + '#' + path


class Check(QObject):
    finished = Signal(object)


class EditorialPage(QWebEnginePage):
    def acceptNavigationRequest(self, url, kind, main):
        if not main: return True
        if url.scheme() in ('http', 'https') and url.host() == 'bonaqu.github.io' and url.path().startswith('/nte-meta/'):
            return True
        if kind == QWebEnginePage.NavigationType.NavigationTypeLinkClicked and url.scheme() in ('http', 'https'):
            QDesktopServices.openUrl(url)
        return False


STYLE = '''
QWidget {background:#1e1f23;color:#eeeeef;font:14px "Segoe UI";}
QFrame#sidebar {background:#111215;border-right:1px solid #44454c;}
QLabel#brand {font-size:25px;font-weight:800;color:#ff4897;}
QLabel#heading {font-size:25px;font-weight:750;}
QLabel#muted {color:#b5b7c2;}
QLabel#status {color:#64d9e7;padding:12px;background:#101216;border-radius:9px;}
QPushButton {min-height:44px;padding:0 14px;border:1px solid #51525a;border-radius:12px;background:#292a30;text-align:left;}
QPushButton:hover {border-color:#ff4897;background:#34313a;}
QPushButton:pressed {background:#48414a;}
QPushButton:checked {background:#f44392;border-color:#ff6cab;color:#111215;font-weight:700;}
QPushButton:disabled {color:#858690;border-color:#373840;}
QPushButton#primary {background:#eeeae5;color:#202126;font-weight:700;border-radius:22px;}
QPushButton:focus {border:2px solid #76dfeb;}
QToolTip {background:#111215;color:#eeeeef;border:1px solid #ff4897;padding:8px;}
QProgressBar {max-height:4px;border:none;background:#101115;}
QProgressBar::chunk {background:#ff4897;}
'''


class Desktop(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('NTE Meta — редакция и данные игры')
        self.setWindowIcon(QIcon(str(REPOSITORY/'public/assets/logo.svg')))
        self.resize(1380, 900); self.setMinimumSize(920, 650)
        self.tool = None; self.allow_close = False; self.checking = False
        DATA.mkdir(parents=True, exist_ok=True)
        for name in ('browser', 'cache', 'downloads', 'temp'): (DATA / name).mkdir(exist_ok=True)
        self.profile = QWebEngineProfile('nte-editor', self)
        self.profile.setPersistentStoragePath(str(DATA / 'browser'))
        self.profile.setCachePath(str(DATA / 'cache'))
        self.profile.setHttpCacheMaximumSize(160 * 1024 * 1024)
        self.profile.setDownloadPath(str(DATA / 'downloads'))
        self.profile.downloadRequested.connect(self.download)
        self.view = QWebEngineView(self)
        self.page = EditorialPage(self.profile, self.view)
        self.view.setPage(self.page)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, False)
        self.page.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, False)
        self.page.newWindowRequested.connect(self.open_external)
        self.page.permissionRequested.connect(lambda permission: permission.deny())
        self.view.loadFinished.connect(self.loaded)
        self.view.loadProgress.connect(lambda value: self.loading.setValue(value))
        self.checker = Check(self); self.checker.finished.connect(self.checked)

        central = QWidget(); layout = QHBoxLayout(central); layout.setContentsMargins(0, 0, 0, 0); layout.setSpacing(0)
        sidebar = QFrame(); sidebar.setObjectName('sidebar'); sidebar.setFixedWidth(242)
        rail = QVBoxLayout(sidebar); rail.setContentsMargins(16, 22, 16, 18); rail.setSpacing(9)
        brand = QLabel('NTE META'); brand.setObjectName('brand'); rail.addWidget(brand)
        subtitle = QLabel('РЕДАКЦИЯ / ЛОКАЛЬНЫЕ ДАННЫЕ'); subtitle.setObjectName('muted'); subtitle.setWordWrap(True); rail.addWidget(subtitle)
        rail.addSpacing(22); self.nav = []
        local = QPushButton('Игра и выгрузки'); local.setCheckable(True)
        local.clicked.connect(self.show_local); rail.addWidget(local); self.nav.append(local)
        for name, route in SECTIONS:
            button = QPushButton(name); button.setCheckable(True)
            button.clicked.connect(lambda _, p=route, b=button: self.navigate(p, b))
            rail.addWidget(button); self.nav.append(button)
        rail.addStretch()
        about = QLabel('Войдите в свой аккаунт сайта.\nПрава редактора и сохранение работают через NTE Meta.'); about.setWordWrap(True); about.setObjectName('muted'); rail.addWidget(about)
        layout.addWidget(sidebar)
        body = QWidget(); column = QVBoxLayout(body); column.setContentsMargins(18, 14, 18, 14)
        toolbar = QHBoxLayout(); self.caption = QLabel('Данные игры'); self.caption.setObjectName('heading'); toolbar.addWidget(self.caption); toolbar.addStretch()
        retry = QPushButton('Обновить'); retry.setToolTip('Повторить загрузку страницы или проверить игровой патч.'); retry.clicked.connect(self.refresh); toolbar.addWidget(retry)
        column.addLayout(toolbar)
        self.loading = QProgressBar(); self.loading.setRange(0, 100); self.loading.setTextVisible(False); self.loading.hide(); column.addWidget(self.loading)
        self.error = QLabel(''); self.error.setWordWrap(True); self.error.hide(); column.addWidget(self.error)
        self.stack = QStackedWidget(); self.local = self.make_local(); self.stack.addWidget(self.local); self.stack.addWidget(self.view); column.addWidget(self.stack)
        layout.addWidget(body, 1); self.setCentralWidget(central); self.setStyleSheet(STYLE)
        self.timer = QTimer(self); self.timer.timeout.connect(self.poll_tool); self.timer.start(1000)
        self.show_local(); QTimer.singleShot(100, self.check_game)

    def make_local(self):
        page = QWidget(); box = QVBoxLayout(page); box.setContentsMargins(0, 12, 0, 0); box.setSpacing(16)
        self.game_status = QLabel('Проверяем установленную игру…'); self.game_status.setObjectName('status'); self.game_status.setWordWrap(True); box.addWidget(self.game_status)
        self.paths = QLabel(); self.paths.setWordWrap(True); self.paths.setObjectName('muted'); box.addWidget(self.paths)
        guide = QLabel('После обновления: извлеките патч → подготовьте снимок → просмотрите экспорт → подготовьте персонажей и опубликуйте данные.\nСтарые версии сохраняются. Неизменившиеся файлы переиспользуются; новые версии не затирают прежние.'); guide.setWordWrap(True); box.addWidget(guide)
        self.tool_buttons = []
        for action, title in ACTIONS.items():
            button = QPushButton(title); button.setToolTip('Открыть инструмент выгрузки с выбранным действием. Его окно показывает параметры, ход работы и ошибки.')
            button.clicked.connect(lambda _, a=action: self.launch_tool(a)); box.addWidget(button); self.tool_buttons.append(button)
        controls = QHBoxLayout()
        settings = QPushButton('Пути и все инструменты'); settings.clicked.connect(lambda: self.launch_tool()); controls.addWidget(settings); self.tool_buttons.append(settings)
        check = QPushButton('Проверить обновление игры'); check.clicked.connect(self.check_game); controls.addWidget(check); box.addLayout(controls)
        self.tool_status = QLabel(''); self.tool_status.setWordWrap(True); self.tool_status.setObjectName('muted'); box.addWidget(self.tool_status)
        export = QPushButton('Открыть последний читаемый каталог'); export.setObjectName('primary'); export.clicked.connect(self.open_export); box.addWidget(export)
        box.addStretch(); return page

    def select(self, button):
        for item in self.nav: item.setChecked(item is button)

    def confirm_leave(self, callback):
        if self.stack.currentWidget() is self.local: callback(); return
        def inspected(opened):
            if opened and QMessageBox.question(self, 'Открыт редактор', 'Перейти в другой раздел? Сначала сохраните изменения, если хотите их оставить.', QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No, QMessageBox.StandardButton.No) != QMessageBox.StandardButton.Yes: return
            callback()
        self.page.runJavaScript("Boolean(document.querySelector('dialog.editor-shell[open]'))", inspected)

    def show_local(self):
        self.confirm_leave(lambda: (self.stack.setCurrentWidget(self.local), self.caption.setText('Данные игры'), self.select(self.nav[0]), self.error.hide(), self.loading.hide()))

    def navigate(self, route, button):
        def go():
            self.caption.setText(button.text()); self.select(button); self.error.hide(); self.stack.setCurrentWidget(self.view); self.loading.show()
            self.view.setUrl(QUrl(site_url(route)))
        self.confirm_leave(go)

    def refresh(self):
        if self.stack.currentWidget() is self.local: self.check_game()
        else: self.confirm_leave(self.view.reload)

    def loaded(self, success):
        self.loading.hide()
        self.error.setText('Не удалось открыть сайт. Проверьте соединение и нажмите «Обновить». Локальные инструменты доступны в разделе «Данные установленной игры».')
        self.error.setVisible(not success)

    def check_game(self):
        if self.checking: return
        self.checking = True; self.game_status.setText('Сравниваем архивы с рабочей выгрузкой…')
        def work():
            try:
                values = config(); result = check_update(Path(values['game']), Path(values['source']))
                result['paths'] = values
                latest = sorted(Path(values['output']).glob('*/extraction-status.json'), reverse=True)[:1]
                if latest:
                    try:
                        status = json.loads(latest[0].read_text('utf-8-sig'))
                        result['compatibilityError'] = status.get('status') == 'failed' and status.get('compatibilityError', False)
                    except (OSError, ValueError): pass
            except Exception as error: result = {'error': str(error)}
            self.checker.finished.emit(result)
        threading.Thread(target=work, daemon=True).start()

    def checked(self, result):
        self.checking = False
        if 'error' in result:
            self.game_status.setText(result['error'] + '\nОткройте «Пути и все инструменты» для выбора игры и выгрузки.'); return
        self.paths.setText('Игра: ' + result['paths']['game'] + '\nВыгрузка: ' + result['snapshot'] + '\nДанные приложения: ' + str(DATA))
        changes = len(result['added']) + len(result['changed']) + len(result['removed'])
        self.game_status.setText(f'Изменилось архивов: {changes}. Доступно обновление игровых данных.' if result['needsExtraction'] else 'Архивы не изменились. Рабочая выгрузка актуальна.')
        if result.get('compatibilityError'):
            self.game_status.setText('Файлы игры изменились, но повторные попытки чтения архивов не удались. Дождитесь окончания загрузок в лаунчере и повторите выгрузку. Журнал доступен через «Пути и все инструменты». Прежняя рабочая выгрузка сохранена.')

    def launch_tool(self, action=None):
        if self.tool and self.tool.poll() is None: return
        if action is not None and action not in ACTIONS: raise ValueError('Неизвестное действие')
        environment = os.environ.copy(); environment.update(TEMP=str(DATA/'temp'), TMP=str(DATA/'temp'))
        command = [sys.executable, str(REPOSITORY/'tools/nte-data-workbench/app.py')]
        if action: command += ['--action', action]
        try:
            self.tool = subprocess.Popen(command, cwd=REPOSITORY, env=environment, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            self.tool_status.setText('Инструмент выгрузки открыт в отдельном окне. Он продолжит работу, если закрыть редакцию.')
            for button in self.tool_buttons: button.setEnabled(False)
        except OSError as error: QMessageBox.warning(self, 'Не удалось открыть инструменты', str(error))

    def poll_tool(self):
        if self.tool and self.tool.poll() is not None:
            code = self.tool.returncode; self.tool = None
            for button in self.tool_buttons: button.setEnabled(True)
            self.tool_status.setText('Инструмент закрыт.' if code == 0 else 'Инструмент завершился с ошибкой. Откройте его заново и проверьте журнал.'); self.check_game()

    def open_export(self):
        value = config().get('last_export', '')
        file = Path(value)/'Для игрока/Начать здесь.html' if value else None
        if file and file.is_file(): QDesktopServices.openUrl(QUrl.fromLocalFile(str(file)))
        else: QMessageBox.information(self, 'Каталог пока не выбран', 'Создайте экспорт или выберите его в инструментах выгрузки.')

    def open_external(self, request):
        if request.isUserInitiated() and request.requestedUrl().scheme() in ('http', 'https'):
            QDesktopServices.openUrl(request.requestedUrl())

    def download(self, request):
        filename = Path(request.downloadFileName()).name
        path, _ = QFileDialog.getSaveFileName(self, 'Сохранить файл', str(DATA/'downloads'/filename))
        if path:
            request.setDownloadDirectory(str(Path(path).parent)); request.setDownloadFileName(Path(path).name); request.accept()
        else: request.cancel()

    def closeEvent(self, event):
        if self.allow_close or self.stack.currentWidget() is self.local:
            self.view.stop(); self.page.deleteLater(); self.view.deleteLater(); self.profile.deleteLater()
            event.accept(); return
        event.ignore()
        self.confirm_leave(lambda: (setattr(self, 'allow_close', True), self.close()))


if __name__ == '__main__':
    application = QApplication(sys.argv); application.setApplicationName('NTE Meta')
    DATA.mkdir(parents=True, exist_ok=True)
    lock = QLockFile(str(DATA/'editor.lock')); lock.setStaleLockTime(0)
    if not lock.tryLock(100):
        QMessageBox.information(None, 'NTE Meta', 'Редакция уже открыта. Перейдите в её окно на панели задач.')
        sys.exit(0)
    window = Desktop(); window.show(); sys.exit(application.exec())

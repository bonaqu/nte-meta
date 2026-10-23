"""Local Windows workbench. Uses the existing shared tools; no game writes."""
from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from exporter import export

REPOSITORY = Path(__file__).resolve().parents[2]
SETTINGS = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'NTEMetaWorkbench/settings.json'
DEFAULTS = {
    'game': r'D:\Games\Neverness To Everness',
    'tool': r'D:\CODEX\Programs\UEExtractor\1.0.8.7\UEExtractor.exe',
    'mapping': r'D:\CODEX\Tasks\nte-local-data\NTE_Latest.usmap',
    'key': r'D:\CODEX\Tasks\nte-local-data\mount\HT\aes.txt',
    'output': r'D:\CODEX\Tasks\nte-local-data',
    'source': r'D:\CODEX\Tasks\nte-local-data',
    'last_export': '',
}

HELP = {
    'game': 'Папка, выбранная в игровом лаунчере: например D:\\Games\\Neverness To Everness. Программа читает архивы внутри Client, но не меняет игру, настройки или сохранения. Перед извлечением закройте игру и дождитесь окончания обновления.',
    'tool': 'UEExtractor — установленный инструмент чтения архивов Unreal Engine. Здесь выбирается именно UEExtractor.exe, а не исполняемый файл игры. Обычно этот путь уже настроен и менять его не нужно.',
    'mapping': 'Схема .usmap объясняет, как устроены таблицы текущего клиента. Она нужна на этапе 1. После крупного обновления старая схема может перестать подходить: ошибка чтения будет видна в журнале, прежние выгрузки сохранятся.',
    'key': 'Локальный текстовый файл с ключом игровых архивов. Это не пароль от аккаунта. Программа читает файл, но не показывает его содержимое и не публикует ключ. Обычно оставьте настроенный путь.',
    'output': 'Родительская папка для новых рабочих выгрузок этапа 1. Внутри каждый раз создаётся отдельная папка с датой. Файлы export/audio/*.wem в ней — внутренние звуки игры, а не готовая музыка. Для обычного просмотра используйте этап 4.',
    'source': 'Рабочая выгрузка для этапов 2 и 3: внутри должны быть export/extraction.json и папка localization. После этапа 1 выбирается автоматически. Это ещё не каталог для игрока; готовый каталог создаёт этап 4.',
    'extract': 'Шаг 1 — заново прочитать установленный клиент после патча. Извлекаются исходные таблицы, переводы, текстуры и установленные голосовые пакеты. Результат технический: WEM и игровые ID пока не предназначены для обычного просмотра. Затем выполните шаг 3, после него шаг 4.',
    'supplement': 'Необязательный шаг 2 — дополнить пробелы клиента из Nanoka, Kaiden и Neverness.app. Нужен интернет. Данные источников отмечаются отдельно, русские названия сверяются с клиентом. Если интернет недоступен, можно подготовить и экспортировать имеющиеся данные без дополнения.',
    'normalize': 'Шаг 3 — обработать выбранную рабочую выгрузку: связать игровые ID с персонажами, подготовить изображения и декодировать WEM в обычное аудио для сайта, создать проверенный снимок. Это обновляет локальные файлы проекта, но само ничего не публикует на сайте. После успешного завершения нажмите шаг 4.',
    'export': 'Шаг 4 — выбрать, куда сохранить готовый каталог. Получите HTML-досье персонажей с разделами навыков, пробуждений, материалов, подарков, гардероба и озвучки; понятный Excel; PNG и MP3 с именем персонажа, языком и ситуацией реплики. Полные JSON/CSV остаются отдельно для технической работы. Используется последний успешно подготовленный снимок шага 3. Новая папка не перезаписывает прошлые результаты.',
    'open': 'Открыть начальную HTML-страницу последнего готового экспорта в браузере. Отсюда можно перейти к персонажу, предметам или Excel. Рабочая папка с внутренними WEM этой кнопкой не открывается.',
    'working': 'Открыть техническую рабочую папку из строки «Рабочая выгрузка». Здесь исходные файлы чтения игры и журналы. WEM — внутренний формат звука; готовые MP3 и картинки PNG находятся в каталоге после шага 4.',
    'media': 'Если включено: экспорт включает PNG для обычных просмотрщиков и MP3 для проигрывателей, сгруппированные по персонажу, языку и назначению; HTML умеет их показывать и проигрывать. Если выключено: только тексты и таблицы, быстрее и меньше места. Первый экспорт с медиа может занять несколько минут.',
    'log': 'Здесь видно, какой этап выполняется: текущий персонаж, количество строк и число готовых MP3. Технические ошибки сохраняются в журнале. Во время обработки кнопки запуска временно выключены; дождитесь сообщения «Готово» или текста ошибки.',
}


class Tooltip:
    def __init__(self, widget, text, context):
        self.widget, self.text, self.context = widget, text, context
        self.window = None; self.timer = None
        widget.bind('<Enter>', self.enter, add='+'); widget.bind('<FocusIn>', self.enter, add='+')
        widget.bind('<Leave>', self.hide, add='+'); widget.bind('<FocusOut>', self.hide, add='+')
        widget.bind('<ButtonPress>', self.hide, add='+'); widget.bind('<Destroy>', self.hide, add='+')
    def enter(self, _=None):
        self.context.set(self.text)
        self.hide(); self.timer = self.widget.after(450, self.show)
    def show(self):
        self.timer = None
        if self.window or not self.widget.winfo_exists(): return
        self.window = tk.Toplevel(self.widget); self.window.wm_overrideredirect(True)
        ttk.Label(self.window, text=self.text, wraplength=440, padding=12, relief='solid', borderwidth=1).pack()
        self.window.update_idletasks()
        x = min(self.widget.winfo_rootx(), self.widget.winfo_screenwidth() - self.window.winfo_reqwidth() - 12)
        y = min(self.widget.winfo_rooty() + self.widget.winfo_height() + 8, self.widget.winfo_screenheight() - self.window.winfo_reqheight() - 12)
        self.window.geometry(f'+{max(0,x)}+{max(0,y)}')
    def hide(self, _=None):
        if self.timer:
            self.widget.after_cancel(self.timer); self.timer = None
        if self.window:
            self.window.destroy(); self.window = None


class Workbench(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('NTE Meta — выгрузка данных игры')
        self.geometry('1000x800')
        self.minsize(760, 680)
        self.messages = queue.Queue()
        self.busy = False
        self.process = None
        self.last_output = ''
        config = {**DEFAULTS}
        if SETTINGS.exists():
            try:
                saved = json.loads(SETTINGS.read_text(encoding='utf-8'))
                if isinstance(saved, dict):config.update({key:value for key,value in saved.items() if key in DEFAULTS and isinstance(value,str)})
            except (ValueError,OSError):pass
        self.values = {k: tk.StringVar(value=v) for k,v in config.items()}
        self.last_output = config['last_export']
        self.help_text = tk.StringVar(value='Наведите мышь на поле или кнопку: здесь появится подробное объяснение. Можно также перейти к полю клавишей Tab.')
        self.tooltips = []
        def explain(widget, key, prefix=''):
            self.tooltips.append(Tooltip(widget, prefix + HELP[key], self.help_text))
        body = ttk.Frame(self, padding=18)
        body.pack(fill='both', expand=True)
        ttk.Label(body, text='NTE Meta · локальные данные', font=('Segoe UI', 18, 'bold')).pack(anchor='w')
        ttk.Label(body, text='Архивы игры читаются без изменения. Выгрузки и настройки хранятся отдельно.').pack(anchor='w', pady=(6,16))
        fields = ttk.Frame(body)
        fields.pack(fill='x')
        fields.columnconfigure(1, weight=1)
        for index,(key,label,folder) in enumerate([
            ('game','Папка установленной игры',True),('tool','Инструмент UEExtractor.exe',False),
            ('mapping','Схема чтения архивов (.usmap)',False),('key','Файл ключа архивов',False),
            ('output','Куда извлекать обновления',True),('source','Рабочая выгрузка (для шагов 2–3)',True),
        ]):
            caption=ttk.Label(fields,text=label); caption.grid(row=index,column=0,sticky='w',padx=(0,12),pady=5); explain(caption,key)
            entry=ttk.Entry(fields,textvariable=self.values[key]); entry.grid(row=index,column=1,sticky='ew',pady=5); explain(entry,key)
            browse=ttk.Button(fields,text='Обзор…',command=lambda k=key,d=folder:self.browse(k,d)); browse.grid(row=index,column=2,padx=(8,0),pady=5); explain(browse,key,'Выбрать путь в окне проводника. ')
        actions = ttk.Frame(body)
        actions.pack(fill='x',pady=16)
        self.buttons=[]
        for column in range(2):actions.columnconfigure(column,weight=1)
        for index,(title,command,key) in enumerate([('1 · Извлечь обновление',self.extract,'extract'),('2 · Обновить дополнение',self.supplement,'supplement'),('3 · Подготовить снимок игры',self.normalize,'normalize'),('4 · Каталог игрока / Excel / MP3',self.export_data,'export')]):
            button=ttk.Button(actions,text=title,command=command)
            button.grid(row=index//2,column=index%2,sticky='ew',padx=4,pady=4);self.buttons.append(button);explain(button,key)
        result=ttk.Button(actions,text='Открыть каталог игрока',command=self.open_output); result.grid(row=2,column=0,sticky='ew',padx=4,pady=4); explain(result,'open')
        working=ttk.Button(actions,text='Открыть рабочую папку',command=self.open_working); working.grid(row=2,column=1,sticky='ew',padx=4,pady=4); explain(working,'working')
        self.media=tk.BooleanVar(value=True)
        media=ttk.Checkbutton(body,text='Добавить в каталог картинки PNG и озвучку MP3 с понятными названиями',variable=self.media); media.pack(anchor='w'); explain(media,'media')
        help_label=tk.Label(body,textvariable=self.help_text,wraplength=900,relief='groove',padx=8,pady=8,height=3,anchor='w',justify='left'); help_label.pack(fill='x',pady=8)
        body.bind('<Configure>', lambda event: help_label.configure(wraplength=max(300,event.width-52)))
        ttk.Label(body,text='Порядок: извлечь обновление → подготовить данные сайта → экспорт. Публикация сайта выполняется отдельно через GitHub PR/Actions.',wraplength=900).pack(anchor='w',pady=10)
        self.status=tk.StringVar(value='Готов к работе. Можно экспортировать уже извлечённый снимок.')
        ttk.Label(body,textvariable=self.status,wraplength=900).pack(anchor='w',pady=4)
        self.progress=ttk.Progressbar(body,mode='indeterminate');self.progress.pack(fill='x',pady=5)
        self.log=tk.Text(body,wrap='word',height=15,font=('Consolas',10),state='disabled')
        self.log.pack(fill='both',expand=True)
        explain(self.log,'log'); explain(self.progress,'log')
        self.protocol('WM_DELETE_WINDOW',self.close)
        self.after(100,self.poll)

    def browse(self,key,folder):
        value=filedialog.askdirectory() if folder else filedialog.askopenfilename()
        if value:self.values[key].set(value)

    def save_settings(self):
        SETTINGS.parent.mkdir(parents=True,exist_ok=True)
        SETTINGS.write_text(json.dumps({k:v.get() for k,v in self.values.items()},ensure_ascii=False,indent=2),encoding='utf-8')

    def run(self,operation,done_text='Готово'):
        if self.busy:return
        self.save_settings();self.busy=True
        for button in self.buttons:button.state(['disabled'])
        self.progress.start();self.status.set('Выполняется…')
        def work():
            try:operation();self.messages.put(('done',done_text))
            except Exception as error:self.messages.put(('error',str(error)))
        threading.Thread(target=work,daemon=True).start()

    def command(self,args):
        # Logs from UEExtractor can contain archive keys. extract-local.ps1 redirects
        # them into local files; the GUI only displays its sanitized top-level output.
        self.process=subprocess.Popen(args,cwd=REPOSITORY,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
            text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        for line in self.process.stdout:self.messages.put(('log',line.rstrip()))
        code=self.process.wait();self.process=None
        if code:raise RuntimeError(f'Команда завершилась с кодом {code}. Проверьте журнал выбранной выгрузки.')

    def extract(self):
        values={k:v.get() for k,v in self.values.items()}
        def operation():
            self.command(['pwsh','-NoProfile','-File',str(REPOSITORY/'scripts/game-data/extract-local.ps1'),
                '-GameDirectory',values['game'],'-Tool',values['tool'],'-Mapping',values['mapping'],
                '-ArchiveKeyFile',values['key'],'-Output',values['output']])
            candidates=sorted(p for p in Path(values['output']).iterdir() if (p/'export/extraction.json').exists())
            if candidates:self.messages.put(('source',str(candidates[-1])))
        self.run(operation,'Извлечение завершено. WEM — внутренний формат. Теперь нажмите 3, затем 4 для готового каталога; шаг 2 необязателен.')

    def normalize(self):
        source=self.values['source'].get()
        def operation():
            self.command([sys.executable,str(REPOSITORY/'scripts/game-data/normalize.py'),'--source',source,'--repository',str(REPOSITORY)])
            database=Path(source)/'verified-reference.sqlite'
            if database.exists():database=Path(source)/('verified-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.sqlite')
            self.command([sys.executable,str(REPOSITORY/'scripts/game-data/validate.py'),'--database',str(database)])
            self.command(['node',str(REPOSITORY/'scripts/game-data/build-asset-aliases.mjs'),'--output',str(REPOSITORY/'src/data/native-media-aliases.json')])
        self.run(operation,'Снимок подготовлен. Нажмите 4, чтобы получить читаемый каталог, Excel, PNG и MP3.')

    def supplement(self):
        source=self.values['source'].get()
        self.run(lambda:self.command(['node',str(REPOSITORY/'scripts/game-data/fetch-supplement.mjs'),'--source',source]),'Дополнение загружено. Теперь нажмите 3, затем 4.')

    def export_data(self):
        parent=filedialog.askdirectory(title='Куда сохранить новую папку экспорта')
        if not parent:return
        target=Path(parent)/('NTE-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
        include_media=self.media.get()
        def operation():
            export(REPOSITORY,target,include_media,lambda line:self.messages.put(('log',line)))
            self.messages.put(('export',str(target)))
        self.run(operation)

    def open_output(self):
        path=Path(self.last_output)/'Для игрока/Начать здесь.html'
        if self.last_output and path.is_file():os.startfile(path)
        else:messagebox.showinfo('Каталог ещё не создан','Нажмите «4 · Каталог игрока / Excel / MP3» и дождитесь окончания. Затем эта кнопка откроет понятный каталог, а не внутренние файлы игры.')

    def open_working(self):
        path=Path(self.values['source'].get())
        if path.is_dir():os.startfile(path)

    def poll(self):
        try:
            while True:
                kind,message=self.messages.get_nowait()
                if kind in ('done','error'):
                    self.busy=False;self.progress.stop()
                    if kind=='error' or not self.status.get().startswith('Экспорт сохранён:'):self.status.set(message)
                    for button in self.buttons:button.state(['!disabled'])
                    if kind=='error':messagebox.showerror('NTE Meta',message)
                elif kind=='source':self.values['source'].set(message);self.save_settings()
                elif kind=='export':self.last_output=message;self.values['last_export'].set(message);self.save_settings();self.status.set('Экспорт сохранён: '+message)
                self.log.configure(state='normal');self.log.insert('end',message+'\n');self.log.see('end');self.log.configure(state='disabled')
        except queue.Empty:pass
        self.after(100,self.poll)

    def close(self):
        if self.busy:
            messagebox.showinfo('NTE Meta','Дождитесь окончания текущей операции. Игра и существующие выгрузки не изменяются.');return
        self.save_settings();self.destroy()


if __name__=='__main__':Workbench().mainloop()

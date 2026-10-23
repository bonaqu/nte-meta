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
}


class Workbench(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('NTE Meta — выгрузка данных игры')
        self.geometry('1000x740')
        self.minsize(760, 580)
        self.messages = queue.Queue()
        self.busy = False
        self.process = None
        self.last_output = DEFAULTS['output']
        config = {**DEFAULTS}
        if SETTINGS.exists():
            try:
                saved = json.loads(SETTINGS.read_text(encoding='utf-8'))
                if isinstance(saved, dict):config.update({key:value for key,value in saved.items() if key in DEFAULTS and isinstance(value,str)})
            except (ValueError,OSError):pass
        self.values = {k: tk.StringVar(value=v) for k,v in config.items()}
        body = ttk.Frame(self, padding=18)
        body.pack(fill='both', expand=True)
        ttk.Label(body, text='NTE Meta · локальные данные', font=('Segoe UI', 18, 'bold')).pack(anchor='w')
        ttk.Label(body, text='Архивы игры читаются без изменения. Выгрузки и настройки хранятся отдельно.').pack(anchor='w', pady=(6,16))
        fields = ttk.Frame(body)
        fields.pack(fill='x')
        fields.columnconfigure(1, weight=1)
        for index,(key,label,folder) in enumerate([
            ('game','Папка установленной игры',True),('tool','UEExtractor.exe',False),
            ('mapping','Файл схемы .usmap',False),('key','Файл ключа архивов',False),
            ('output','Папка новых выгрузок',True),('source','Существующая выгрузка',True),
        ]):
            ttk.Label(fields,text=label).grid(row=index,column=0,sticky='w',padx=(0,12),pady=5)
            ttk.Entry(fields,textvariable=self.values[key]).grid(row=index,column=1,sticky='ew',pady=5)
            ttk.Button(fields,text='Обзор…',command=lambda k=key,d=folder:self.browse(k,d)).grid(row=index,column=2,padx=(8,0),pady=5)
        actions = ttk.Frame(body)
        actions.pack(fill='x',pady=16)
        self.buttons=[]
        for column in range(2):actions.columnconfigure(column,weight=1)
        for index,(title,command) in enumerate([('1 · Извлечь обновление',self.extract),('2 · Обновить дополнение',self.supplement),('3 · Подготовить данные сайта',self.normalize),('4 · Экспорт Excel / CSV / JSON',self.export_data)]):
            button=ttk.Button(actions,text=title,command=command)
            button.grid(row=index//2,column=index%2,sticky='ew',padx=4,pady=4);self.buttons.append(button)
        ttk.Button(actions,text='Открыть результат',command=self.open_output).grid(row=2,column=0,columnspan=2,sticky='ew',padx=4,pady=4)
        self.media=tk.BooleanVar(value=True)
        ttk.Checkbutton(body,text='При экспорте копировать изображения и аудио в отдельную папку «Медиа»',variable=self.media).pack(anchor='w')
        ttk.Label(body,text='Порядок: извлечь обновление → подготовить данные сайта → экспорт. Публикация сайта выполняется отдельно через GitHub PR/Actions.',wraplength=900).pack(anchor='w',pady=10)
        self.status=tk.StringVar(value='Готов к работе. Можно экспортировать уже извлечённый снимок.')
        ttk.Label(body,textvariable=self.status,wraplength=900).pack(anchor='w',pady=4)
        self.progress=ttk.Progressbar(body,mode='indeterminate');self.progress.pack(fill='x',pady=5)
        self.log=tk.Text(body,wrap='word',height=15,font=('Consolas',10),state='disabled')
        self.log.pack(fill='both',expand=True)
        self.protocol('WM_DELETE_WINDOW',self.close)
        self.after(100,self.poll)

    def browse(self,key,folder):
        value=filedialog.askdirectory() if folder else filedialog.askopenfilename()
        if value:self.values[key].set(value)

    def save_settings(self):
        SETTINGS.parent.mkdir(parents=True,exist_ok=True)
        SETTINGS.write_text(json.dumps({k:v.get() for k,v in self.values.items()},ensure_ascii=False,indent=2),encoding='utf-8')

    def run(self,operation):
        if self.busy:return
        self.save_settings();self.busy=True
        for button in self.buttons:button.state(['disabled'])
        self.progress.start();self.status.set('Выполняется…')
        def work():
            try:operation();self.messages.put(('done','Готово'))
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
        self.run(operation)

    def normalize(self):
        source=self.values['source'].get()
        def operation():
            self.command([sys.executable,str(REPOSITORY/'scripts/game-data/normalize.py'),'--source',source,'--repository',str(REPOSITORY)])
            database=Path(source)/'verified-reference.sqlite'
            if database.exists():database=Path(source)/('verified-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.sqlite')
            self.command([sys.executable,str(REPOSITORY/'scripts/game-data/validate.py'),'--database',str(database)])
        self.run(operation)

    def supplement(self):
        source=self.values['source'].get()
        self.run(lambda:self.command(['node',str(REPOSITORY/'scripts/game-data/fetch-supplement.mjs'),'--source',source]))

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
        path=Path(self.last_output)
        if not path.is_dir():path=Path(self.values['output'].get())
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
                elif kind=='source':self.values['source'].set(message);self.last_output=message;self.save_settings()
                elif kind=='export':self.last_output=message;self.status.set('Экспорт сохранён: '+message)
                self.log.configure(state='normal');self.log.insert('end',message+'\n');self.log.see('end');self.log.configure(state='disabled')
        except queue.Empty:pass
        self.after(100,self.poll)

    def close(self):
        if self.busy:
            messagebox.showinfo('NTE Meta','Дождитесь окончания текущей операции. Игра и существующие выгрузки не изменяются.');return
        self.save_settings();self.destroy()


if __name__=='__main__':Workbench().mainloop()

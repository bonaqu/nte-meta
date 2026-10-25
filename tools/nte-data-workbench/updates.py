"""Read-only installed archive comparison. No launcher/profile changes."""
from __future__ import annotations
import datetime
import json
import os
import re
import subprocess
from pathlib import Path

ARCHIVE_FOLDERS = ('Paks', 'PatchPaks', 'TagPatchPaks')

def snapshot_folder(path: Path) -> Path:
    def ready(folder):
        if not (folder / 'export/extraction.json').is_file(): return False
        status=folder/'extraction-status.json'
        return not status.exists() or json.loads(status.read_text('utf-8-sig')).get('status')=='complete'
    if ready(path): return path
    candidates = sorted(p for p in path.iterdir() if p.is_dir() and ready(p)) if path.is_dir() else []
    if candidates: return candidates[-1]
    raise ValueError('Рабочая выгрузка не найдена. Сначала выполните шаг 1 или выберите папку с export/extraction.json.')

def profile_migration(repository: Path, source: Path) -> Path:
    """Reuse our still-untracked proposal; never overwrite committed migrations."""
    metadata=source/'profile-migration.json'
    if metadata.is_file():
        name=json.loads(metadata.read_text('utf-8'))['file']
        if not re.fullmatch(r'\d{4}_native_profile_update\.sql', name): raise ValueError('Некорректное имя миграции.')
        relative='migrations/'+name
        tracked=subprocess.run(['git','ls-files','--error-unmatch','--',relative],cwd=repository,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        if tracked.returncode!=0: return repository/relative
    files=list((repository/'migrations').glob('*.sql'))
    number=max(int(p.name.split('_',1)[0]) for p in files)+1
    output=repository/'migrations'/f'{number:04d}_native_profile_update.sql'
    metadata.write_text(json.dumps({'file':output.name}),encoding='utf-8')
    return output

def archive_inventory(game: Path) -> list[dict]:
    content = game / 'Client/WindowsNoEditor/HT/Content'
    if not content.is_dir(): raise ValueError('В выбранной папке нет игровых архивов Client/WindowsNoEditor/HT/Content.')
    rows = []
    for folder in ARCHIVE_FOLDERS:
        for file in sorted((content / folder).glob('*')):
            if file.is_file() and file.suffix.lower() in ('.pak', '.utoc', '.ucas'):
                stat = file.stat()
                rows.append(dict(folder=folder, name=file.name, bytes=stat.st_size,
                    modifiedUtc=datetime.datetime.fromtimestamp(stat.st_mtime, datetime.timezone.utc).isoformat()))
    if not rows: raise ValueError('Игровые архивы не найдены. Chromium locales/*.pak не являются архивами игры.')
    return rows

def compare_archives(current: list[dict], previous: list[dict]) -> dict:
    key = lambda row: (row['folder'].lower(), row['name'].lower())
    old, new = {key(r): r for r in previous}, {key(r): r for r in current}
    # PowerShell may serialize 7 fractional second digits, Python 6. Compare
    # nanosecond-neutral timestamps to microseconds; do not flag format changes.
    def signature(row):
        date = datetime.datetime.fromisoformat(row['modifiedUtc'].replace('Z', '+00:00'))
        return row['bytes'], round(date.timestamp() * 1000)
    return dict(added=[new[k] for k in sorted(new.keys() - old.keys())],
        changed=[new[k] for k in sorted(new.keys() & old.keys()) if signature(new[k]) != signature(old[k])],
        removed=[old[k] for k in sorted(old.keys() - new.keys())])

def check_update(game: Path, source: Path) -> dict:
    snapshot = snapshot_folder(source)
    baseline = snapshot / 'archives.json'
    if not baseline.is_file(): raise ValueError('У этой выгрузки нет списка архивов archives.json. Создайте новый снимок шагом 1.')
    current = archive_inventory(game)
    delta = compare_archives(current, json.loads(baseline.read_text(encoding='utf-8-sig')))
    return dict(snapshot=str(snapshot), archiveCount=len(current), needsExtraction=any(delta.values()), **delta)

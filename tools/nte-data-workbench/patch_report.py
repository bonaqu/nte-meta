"""Compare native snapshots by record identity, independently of chunk layout."""
import gzip
import html
import json
from collections import Counter


def rows(path):
    with gzip.open(path, 'rt', encoding='utf-8') as stream:
        for line in stream:
            yield from json.loads(line)['records']


def native(path):
    return {record['originalId']: record for record in rows(path)
            if not record.get('details', {}).get('reference')}


def compare(previous, current):
    old, new = native(previous), native(current)
    added, removed = new.keys() - old.keys(), old.keys() - new.keys()
    changed = {key for key in new.keys() & old.keys()
               if new[key]['sourceHash'] != old[key]['sourceHash']}
    def counts(records, ids):
        return dict(sorted(Counter(records[key]['kind'] for key in ids).items()))
    noteworthy = []
    for key in sorted(added | changed):
        row = new[key]
        if not row['values'].get('ru') or not (
            row['namespace'] == 'ST_Player' and row['gameId'].startswith('Role_Name_')
            or row['kind'] in ('arc', 'wardrobe') and row.get('term')
        ):
            continue
        noteworthy.append(dict(change='added' if key in added else 'changed',
                                kind=row['kind'], name=row['values']['ru'],
                                gameId=row['gameId'], ownerId=row['ownerId']))
    return dict(added=counts(new, added), changed=counts(new, changed),
                removed=counts(old, removed), noteworthy=noteworthy)


def write_report(previous, current, folder):
    report = compare(previous, current)
    (folder/'Изменения патча.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    headers = ['Категория', 'Добавлено', 'Изменено', 'Нет в новом снимке']
    kinds = sorted(set().union(*(report[key] for key in ('added', 'changed', 'removed'))))
    def row(values, tag='td'):
        return '<tr>' + ''.join(f'<{tag}>{html.escape(str(v))}</{tag}>' for v in values) + '</tr>'
    table = row(headers, 'th') + ''.join(row([kind, *(report[key].get(kind, 0) for key in ('added', 'changed', 'removed'))]) for kind in kinds)
    named = row(['Название', 'Категория', 'Изменение', 'Игровой ID'], 'th') + ''.join(
        row([entry['name'], entry['kind'], 'Добавлено' if entry['change']=='added' else 'Изменено', entry['gameId']])
        for entry in report['noteworthy'])
    (folder/'Изменения патча.html').write_text(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Изменения патча · NTE Meta</title>'
        '<style>body{font:16px system-ui;background:#191a1e;color:#eee;max-width:1050px;margin:30px auto;padding:20px}'
        'table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #555;text-align:left}a{color:#70dae6}</style>'
        '<h1>Изменения игровых данных</h1><p>Сравнение строк установленного клиента. Отсутствие строки в новом снимке '
        'не доказывает удаление из игры. Наличие записи не означает, что контент уже вышел.</p>'
        '<p><a href="Изменения патча.json">Скачать JSON</a></p><table>' + table +
        '</table><h2>Именованные персонажи, дуги и облики</h2><table>' + named + '</table></html>', 'utf-8')
    return report

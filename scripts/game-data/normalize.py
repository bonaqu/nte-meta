"""Normalize local game exports. Requires the shared Python/Pillow runtime, no network."""
import argparse, csv, gzip, hashlib, io, json, re, struct
from collections import Counter
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--repository', type=Path, required=True)
parser.add_argument('--reuse-images', action='store_true')
args = parser.parse_args()
export = args.source / 'export'
manifest = json.loads((export / 'extraction.json').read_text(encoding='utf-8-sig'))
content = args.repository / 'scripts/content/game-data'
assets_dir = args.repository / 'public/game-assets'
content.mkdir(parents=True, exist_ok=True)
assets_dir.mkdir(parents=True, exist_ok=True)

def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

images, image_errors = {}, []
for image in manifest['images']:
    try:
        name=Path(image['file']).stem+'.webp'
        existing=assets_dir/name
        if args.reuse_images and existing.exists():
            decoded=Image.open(existing)
            limit=1800 if re.search(r'(lihui|card_show|shizhuang_big)',image['path'],re.I) else 512
            if max(decoded.size)>limit:
                decoded.thumbnail((limit,limit),Image.Resampling.LANCZOS)
                decoded.save(existing,'WEBP',quality=84,method=3)
            images[image['path'].lower()]={'url':'/nte-meta/game-assets/'+name,'width':decoded.width,'height':decoded.height}
            continue
        raw = (export / image['file']).read_bytes()
        width, height, fmt = image['width'], image['height'], image['format']
        if fmt == 'PF_B8G8R8A8':
            decoded = Image.frombytes('RGBA', (width, height), raw, 'raw', 'BGRA')
        elif fmt in ('PF_DXT1', 'PF_DXT5'):
            # Standard DDS header; Pillow performs the BC1/BC3 decode.
            fourcc = b'DXT1' if fmt == 'PF_DXT1' else b'DXT5'
            header = struct.pack('<7I',124,0x81007,height,width,len(raw),0,1)+bytes(44)
            header += struct.pack('<II4s5I',32,4,fourcc,0,0,0,0,0)+struct.pack('<5I',0x1000,0,0,0,0)
            decoded = Image.open(io.BytesIO(b'DDS '+header+raw)).convert('RGBA')
        else:
            raise ValueError('Unsupported texture format '+fmt)
        limit=1800 if re.search(r'(lihui|card_show|shizhuang_big)',image['path'],re.I) else 512
        decoded.thumbnail((limit,limit),Image.Resampling.LANCZOS)
        decoded.save(assets_dir/name,'WEBP',quality=84,method=3)
        images[image['path'].lower()] = {'url':'/nte-meta/game-assets/'+name,'width':decoded.width,'height':decoded.height}
    except Exception as error:
        image_errors.append({'path':image['path'],'error':str(error)})

translations={}
for locale, folder in [('ru','ru'),('en','en'),('ja','ja'),('zh','zh-Hans')]:
    files=sorted((args.source/'localization'/folder).glob('*.csv'),key=lambda p:'_0_P' in p.name)
    for file in files:
        if '_skipped_lines' in file.name: continue
        with file.open(encoding='utf-8-sig',newline='') as stream:
            for row in csv.DictReader(stream):
                key=row.get('key','')
                if '::' in key: translations.setdefault(key,{})[locale]=row.get('source','')

aliases={}
for key,values in translations.items():
    match=re.fullmatch(r'ST_Player::Role_Name_(\d+)',key)
    if match:
        aliases[re.sub(r'[^a-z0-9]','',values.get('en','').lower())]=str(1000+int(match[1]))
for path in (export/'virtual-paths.txt').read_text(encoding='utf-8-sig').splitlines():
    match=re.search(r'/Ability_(\d{3})_([^/]+)/',path)
    if match: aliases[re.sub(r'[^a-z0-9]','',match[2].lower())]=str(1000+int(match[1]))
def alias_owner(key):
    alias=re.sub(r'[^a-z0-9]','',key.split('_',1)[0].lower())
    return aliases.get(alias,'')

def text(value):
    if not isinstance(value,dict): return {}
    namespace=value.get('Namespace') or value.get('TableId','').split('.')[-1]
    key=value.get('Key','')
    return translations.get(namespace+'::'+key, {'zh':value.get('SourceString','')})

def category(key):
    key=key.lower()
    if 'skilldes' in key or 'gameplayability' in key: return 'skill'
    if 'awaken' in key: return 'awakening'
    if 'fork' in key: return 'arc'
    if 'equip' in key or 'console' in key: return 'cartridge'
    if 'likeability' in key or 'favorability' in key: return 'affinity'
    if 'appearance' in key or 'fashion' in key: return 'wardrobe'
    if 'st_file' in key or 'filedatatable' in key: return 'biography'
    if 'st_player' in key or '/character/' in key: return 'character'
    if 'attribute' in key or 'packdata' in key: return 'stat'
    if 'item' in key or 'inventory' in key or '/food/' in key: return 'item'
    return 'localization'

def owner(key):
    match=re.search(r'(?:^|[_/])((?:10|19)\d{2})(?:[_/.]|$)',key)
    if match: return match[1]
    match=re.search(r'Role_Name_(\d+)$',key)
    return str(1000+int(match[1])) if match else ''

def image_refs(value):
    found=[]
    if isinstance(value,dict):
        path=value.get('AssetPathName','')
        if path.startswith('/Game/'):
            virtual='HT/Content/'+path[6:].split('.')[0]+'.uasset'
            if virtual.lower() in images: found.append({'path':virtual,**images[virtual.lower()]})
        for child in value.values(): found.extend(image_refs(child))
    elif isinstance(value,list):
        for child in value: found.extend(image_refs(child))
    return list({x['path']:x for x in found}.values())

records=[]
for key, values in sorted(translations.items()):
    namespace,game_id=key.split('::',1)
    records.append({'id':'loc:'+key,'kind':category(key),'namespace':namespace,'gameId':game_id,'ownerId':owner(game_id) or alias_owner(namespace),'values':values,'details':{},'assets':[],'term':bool(re.search(r'(?:name|title)(?:_|$)',game_id,re.I) or (namespace=='ST_Equipment' and game_id.startswith('Suit_'))) and all(len(v)<=150 for v in values.values())})
empty=[]
for table in manifest['tables']:
    objects=json.loads((export/table['file']).read_text(encoding='utf-8-sig'))
    for obj in objects:
        rows=obj.get('Rows',{})
        if not rows: empty.append(table['path'])
        for game_id, details in rows.items():
            values=text(details.get('Name') or details.get('ItemName') or details.get('Title') or details.get('SuitTitle'))
            records.append({'id':'row:'+table['path']+':'+game_id,'kind':category(table['path']),'namespace':obj['Name'],'gameId':game_id,'ownerId':str(details.get('CharacterID') or owner(game_id) or alias_owner(game_id)),'values':values,'details':details,'assets':image_refs(details),'term':bool(values)})
for path,image in images.items():
    records.append({'id':'asset:'+path,'kind':'image','namespace':path.rsplit('/',2)[-2],'gameId':Path(path).stem,'ownerId':owner(Path(path).stem) or alias_owner(Path(path).stem),'values':{},'details':{'virtualPath':path},'assets':[{'path':path,**image}],'term':False})
for record in records:
    if record['term']:
        clean={locale:re.sub(r'<[^>]+>','',value).strip() for locale,value in record['values'].items()}
        if clean!=record['values']:record['originalValues']=record['values'];record['values']=clean
    record['originalId']=record['id']
    buckets=256 if record['kind']=='localization' else 128 if record['kind']=='affinity' else 64
    bucket=f"{int(digest(record['id'])[:2],16)%buckets:02x}"
    record['id']=record['kind']+':'+bucket+'|'+record['id']
    record['search']=' '.join([record['gameId'],record['namespace'],record['ownerId'],*record['values'].values()]).lower()
    record['sourceHash']=digest(compact(record))
dataset_hash=hashlib.sha256()
for record in records: dataset_hash.update((compact(record)+'\n').encode())
chunks={}
for record in records: chunks.setdefault(record['id'].split('|',1)[0],[]).append(record)
with (content/'chunks.jsonl.gz').open('wb') as raw, gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as binary, io.TextIOWrapper(binary,encoding='utf-8',newline='\n') as stream:
    for chunk_id,rows in sorted(chunks.items()):
        payload=compact(rows)
        if len(payload.encode())>1700000: raise ValueError('Chunk exceeds D1 value limit: '+chunk_id)
        stream.write(compact({'id':chunk_id,'kind':rows[0]['kind'],'records':rows,'search':' '.join(r['search'] for r in rows),'hash':digest(payload),'count':len(rows)})+'\n')
report={'formatVersion':1,'locales':['ru','en','ja','zh'],'localizationKeys':len(translations),'records':len(records),'kinds':dict(Counter(r['kind'] for r in records)),'textures':len(images),'extractionErrors':manifest['failures'],'imageErrors':image_errors,'emptyTables':sorted(set(empty)),'source':'Local installed game archives including PatchPaks; original strings preserved','datasetSha256':dataset_hash.hexdigest()}
report['chunks']=len(chunks)
report['chunksSha256']=hashlib.sha256((content/'chunks.jsonl.gz').read_bytes()).hexdigest()
(content/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(compact({k:report[k] for k in ['localizationKeys','records','kinds','textures']}))

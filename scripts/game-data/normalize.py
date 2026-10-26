"""Normalize local game exports. Requires the shared Python/Pillow runtime, no network."""
import argparse, gzip, hashlib, io, json, re, struct, subprocess
from collections import Counter
from pathlib import Path
from PIL import Image
from localization_csv import localized_rows
from media_cache import media_name
from reference_metadata import ability_menu

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--repository', type=Path, required=True)
parser.add_argument('--reuse-images', action='store_true')
parser.add_argument('--vgmstream', default=r'D:\CODEX\Programs\vgmstream\vgmstream-cli.exe')
parser.add_argument('--ffmpeg', default='ffmpeg')
args = parser.parse_args()
export = args.source / 'export'
manifest = json.loads((export / 'extraction.json').read_text(encoding='utf-8-sig'))
cache_path=export/'media-cache.json'
media_cache=json.loads(cache_path.read_text('utf-8')) if cache_path.exists() else {}
next_media_cache={}
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
        raw = (export / image['file']).read_bytes()
        fingerprint=hashlib.sha256(raw).hexdigest()
        name=media_name(image['path'],fingerprint,media_cache,'webp')
        next_media_cache[image['path'].lower()]={'sha256':fingerprint,'name':name}
        existing=assets_dir/name
        if args.reuse_images and existing.exists():
            decoded=Image.open(existing)
            limit=1800 if re.search(r'(lihui|card_show|shizhuang_big)',image['path'],re.I) else 512
            if max(decoded.size)>limit:
                decoded.thumbnail((limit,limit),Image.Resampling.LANCZOS)
                decoded.save(existing,'WEBP',quality=84,method=3)
            images[image['path'].lower()]={'url':'/nte-meta/game-assets/'+name,'width':decoded.width,'height':decoded.height}
            continue
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

translations={};csv_repairs=Counter()
for locale, folder in [('ru','ru'),('en','en'),('ja','ja'),('zh','zh-Hans')]:
    files=sorted((args.source/'localization'/folder).glob('*.csv'),key=lambda p:'_0_P' in p.name)
    for file in files:
        if '_skipped_lines' in file.name: continue
        with file.open(encoding='utf-8-sig',newline='') as stream:
            for key,value,repaired in localized_rows(stream):
                if repaired:csv_repairs[locale]+=1
                if key: translations.setdefault(key if '::' in key else '::'+key,{})[locale]=value

aliases={}
for key,values in translations.items():
    match=re.fullmatch(r'ST_Player::Role_Name_(\d+)',key)
    if match:
        aliases[re.sub(r'[^a-z0-9]','',values.get('en','').lower())]=str(1000+int(match[1]))
for path in (export/'virtual-paths.txt').read_text(encoding='utf-8-sig').splitlines():
    match=re.search(r'/Ability_(\d{3})_([^/]+)/',path)
    if match: aliases[re.sub(r'[^a-z0-9]','',match[2].lower())]=str(1000+int(match[1]))
for table in manifest['tables']:
    if table['path'].endswith('/DT_DefaultAppearanceData.uasset'):
        for obj in json.loads((export/table['file']).read_text(encoding='utf-8-sig')):
            for game_id, details in obj.get('Rows',{}).items():
                match=re.search(r'/Player/(\d{3})_([^/_]+)',details.get('PlayerAppearanceAsset',{}).get('AssetPathName',''),re.I)
                if match:aliases[match[2].lower()]=game_id
def alias_owner(key):
    tokens=re.sub(r'[^a-z0-9]+','_',key.lower()).split('_')
    numeric={str(1000+int(match[2])) for token in tokens if (match:=re.fullmatch(r'([a-z]+)(\d{3})',token)) and str(1000+int(match[2])) in aliases.values()}
    if len(numeric)==1:return next(iter(numeric))
    matches={aliases[t] for t in tokens if t in aliases}
    for token in tokens:
        match=re.fullmatch(r'([a-z]+)(\d{3})',token)
        if match and aliases.get(match[1])==str(1000+int(match[2])):matches.add(aliases[match[1]])
    return next(iter(matches)) if len(matches)==1 else ''

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

audio_errors=[]
audio_dir=args.repository/'public/game-audio'
audio_dir.mkdir(parents=True,exist_ok=True)
audio_locales={'English':'en','Japanese':'ja','Korean':'ko','Chinese':'zh'}
for index,voice in enumerate(manifest.get('voices',[])):
    fingerprint=hashlib.sha256((export/voice['file']).read_bytes()).hexdigest()
    name=media_name(voice['path'],fingerprint,media_cache,'ogg')
    next_media_cache[voice['path'].lower()]={'sha256':fingerprint,'name':name}
    target=audio_dir/name
    try:
        if not target.exists():
            wave=export/'audio'/(Path(name).stem+'.wav')
            try:
                subprocess.run([args.vgmstream,'-o',str(wave),str(export/voice['file'])],check=True,capture_output=True,timeout=40)
                subprocess.run([args.ffmpeg,'-nostdin','-v','error','-y','-i',str(wave),'-c:a','libopus','-b:a','32k','-vbr','on',str(target)],check=True,capture_output=True,timeout=40)
            finally:
                if wave.exists():wave.unlink()
        locale=audio_locales[voice['locale']]
        details={'locale':locale,'eventName':voice['eventName'],'virtualPath':voice['path']}
        values={}
        if voice.get('binding')=='character-voice-map':
            # The game maps owner -> NPC voice family. Only exact localized leaf
            # events become profile lines; container/random/shout banks do not.
            match=re.fullmatch(r'Play_Vo_Char_(.+?)_([A-Za-z]+)_(\d{3})',voice['eventName'])
            if match:
                speaker,category,number=match.groups()
                values=translations.get(f'ST_File::{speaker}_{category}_{number}',{})
                title=translations.get(f'ST_File::{category}_{speaker}_{number}',{}).get('ru') or translations.get(f'ST_File::{category}_{number}',{}).get('ru','')
                if values.get('ru') and title:
                    details.update({'binding':'character-voice-map','titleRu':title,'contentRu':values['ru']})
        records.append({'id':'voice:'+voice['ownerId']+':'+locale+':'+voice['eventName'],'kind':'audio','namespace':'NTE_ProfileVoice','gameId':voice['eventName'],'ownerId':voice['ownerId'],'values':values,'details':details,'assets':[{'path':voice['path'],'url':'/nte-meta/game-audio/'+name}],'term':False})
    except Exception as error:
        audio_errors.append({'event':voice['eventName'],'locale':voice['locale'],'error':str(error)})
    if index and index%500==0:print(f'Audio {index}/{len(manifest.get("voices",[]))}',flush=True)

# One Wwise event may contain alternate takes. Keep its media together instead
# of emitting duplicate reference IDs or duplicate profile lines.
voice_records={}
other_records=[]
for record in records:
    if record['kind']!='audio':
        other_records.append(record)
        continue
    existing=voice_records.get(record['id'])
    if existing:
        existing['assets'].extend(asset for asset in record['assets'] if asset not in existing['assets'])
    else:
        voice_records[record['id']]=record
records=other_records+list(voice_records.values())

# Optional external completion stays distinguishable from native archive rows.
supplement_path=args.source/'supplement.json'
supplement=json.loads(supplement_path.read_text(encoding='utf-8-sig')) if supplement_path.exists() else None
if supplement:
    def plain_name(value):return re.sub(r'<[^>]*>','',value or '').strip()
    by_english={};item_names={key.split('::',1)[1][:-5].lower():value for key,value in translations.items() if key.startswith('ST_Item::') and key.endswith('_name')}
    for key,value in sorted(translations.items(),key=lambda pair:not(pair[0].startswith('ST_Item::') and pair[0].endswith('_name'))):
        if value.get('ru'):
            for name in value.values():
                if name:by_english.setdefault(plain_name(name).lower(),[]).append(value)
    def official_values(name,game_id=''):
        if item_names.get(game_id.lower(),{}).get('ru'):return item_names[game_id.lower()]
        if not name:return {}
        candidates=by_english.get(plain_name(name).lower(),[])
        rus={plain_name(value['ru']) for value in candidates}
        return candidates[0] if len(rus)==1 else {'en':name}
    item_by_icon={str(item.get('original_icon') or item.get('icon','')).replace('/Game/','HT/Content/').lower():item for item in supplement['items'].values()}
    def external_icon(url):
        if '/img/nte/' in url:
            virtual='HT/Content/'+url.split('/img/nte/',1)[1].rsplit('.',1)[0]+'.uasset'
            if virtual.lower() in images:return images[virtual.lower()]['url']
        return url
    def external_record(kind, namespace, game_id, data, url, owner_id='',provider='Nanoka'):
        icon=data.get('original_icon') or data.get('icon','')
        virtual='HT/Content/'+icon[6:]+'.uasset' if icon.startswith('/Game/') else ''
        assets=[{'path':virtual,**images[virtual.lower()]}] if virtual.lower() in images else ([{'path':virtual,'url':'https://static.nanoka.cc/assets/nte'+icon+'.webp'}] if virtual else [])
        values=official_values(data.get('name',''),game_id)
        if kind=='character' and data.get('name'):
            identities=[value for key,value in translations.items() if key.startswith('ST_Player::Role_Name_') and any(plain_name(name).lower()==plain_name(data['name']).lower() for name in value.values())]
            if len({value.get('ru') for value in identities})==1 and identities:values=identities[0]
        return {'id':'reference:'+namespace+':'+game_id,'kind':kind,'namespace':namespace,'gameId':game_id,'ownerId':owner_id,'values':values,'details':{**data,'reference':{'provider':provider,'version':supplement['version'] if provider=='Nanoka' else None,'url':url}},'assets':assets,'term':bool(data.get('name'))}
    for item in supplement['items'].values():
        record=external_record('item','NTE_ReferenceItem',item['id'],item,f"https://static.nanoka.cc/nte/{supplement['version']}/en/item.json")
        usage=next((row for row in supplement.get('experienceCosts',[]) if row['itemId']==item['id']),None)
        if usage:record['details']['upgradeUsage']={**usage,'reference':{'provider':'Neverness.app','url':usage['url']}}
        records.append(record)
    for currency,bundle_id in [('gold','gold_100'),('fons','fons_100')]:
        bundle=next((item for item in supplement['items'].values() if item['id']==bundle_id),None)
        if not bundle:continue
        record=external_record('item','NTE_ReferenceCurrency',currency,bundle,f"https://static.nanoka.cc/nte/{supplement['version']}/en/item.json")
        record['values']={locale:re.sub(r'\s*[×x]\s*[\d, .]+$','',value).strip() for locale,value in official_values(bundle.get('name',''),bundle_id).items()}
        record['details']={'id':currency,'name':record['values'].get('en',''),'derivedFrom':bundle_id,'reference':record['details']['reference']}
        records.append(record)
    for item in supplement['characters']:
        data=item['data']
        selected={k:data[k] for k in ['id','name','breakthrough','gift_reward','preferrable_gifts','stats'] if k in data}
        selected['abilityMenu']=ability_menu(data.get('abilities',[]))
        records.append(external_record('character','NTE_ReferenceCharacter',data['id'],selected,item['url'],data['id']))
        native_fashions={row['gameId'].lower() for row in records if row['kind']=='wardrobe' and row['id'].startswith('row:')}
        for fashion in data.get('fashion',[]):
            fashion_id=fashion['fashion_id']
            if fashion_id.lower() in native_fashions:continue
            record=external_record('wardrobe','NTE_ReferenceFashion',fashion_id,fashion,item['url'],data['id'])
            record['details']['localizedDescription']=official_values(fashion.get('desc',''))
            record['assets']=[]
            for field in ['portrait_img','display_icon','head_icon_big','icon']:
                path=fashion.get(field,'')
                virtual='HT/Content/'+path[6:]+'.uasset' if path.startswith('/Game/') else ''
                if virtual.lower() in images:record['assets'].append({'path':virtual,**images[virtual.lower()]})
            records.append(record)
    for item in supplement['weapons']:
        records.append(external_record('arc','NTE_ReferenceWeapon',item['data']['id'],item['data'],item['url']))
    for gift in supplement.get('giftCatalog',{}).values():
        record=external_record('item','NTE_ReferenceGift',gift['itemId'],gift,gift['sourceUrl'],provider='Neverness.app')
        if not record['values'].get('ru') and gift.get('nameRu'):record['values']['ru']=gift['nameRu']
        native_item=next((row for row in records if row['namespace']=='NTE_ReferenceItem' and row['gameId']==gift['itemId']),None)
        if native_item and any(asset['url'].startswith('/nte-meta/game-assets/') for asset in native_item['assets']):record['assets']=native_item['assets']
        elif gift.get('icon'):record['assets']=[{'url':'https://www.neverness.app'+gift['icon']}]
        records.append(record)
    for row in supplement.get('affinity',[]):
        levels=[];assets=[]
        for level in row['levels']:
            rewards=[]
            for reward in level['rewards']:
                icon_path='HT/Content/'+reward['icon'].split('/img/nte/',1)[1].rsplit('.',1)[0] if '/img/nte/' in reward['icon'] else ''
                matched=item_by_icon.get(icon_path.lower(),{})
                translated=official_values(reward['name'],matched.get('id',''))
                icon=external_icon(reward['icon'])
                rewards.append({**reward,'originalName':reward['name'],'name':translated.get('ru',reward['name']),'iconUrl':icon})
                if icon:assets.append({'url':icon})
            levels.append({**level,'rewards':rewards})
        record=external_record('affinity','NTE_ReferenceAffinity',row['ownerId'],{'levels':levels},row['url'],row['ownerId'],provider='Kaiden')
        record['assets']=list({a['url']:a for a in assets}.values())
        records.append(record)
    for row in supplement.get('communityProfiles',[]):
        records.append(external_record('character','NTE_ReferenceCommunityProfile',row['ownerId'],{'levels':row['levels'],'gifts':row['gifts'],'phases':row.get('phases',[])},row['url'],row['ownerId'],provider='Neverness.app'))

# Keep the StringTable key, its owning character and the exact referring field.
# Shared headings remain shared; unique biography/wardrobe lines gain an owner.
references={}
def collect_references(value, record, field=''):
    if isinstance(value,dict):
        namespace=value.get('Namespace') or value.get('TableId','').split('.')[-1]
        if value.get('Key') and ('Namespace' in value or value.get('TableId')):
            key=namespace+'::'+value['Key']
            entry=references.setdefault(key,{'owners':set(),'fields':[],'count':0})
            if record['ownerId']:entry['owners'].add(record['ownerId'])
            entry['count']+=1
            if len(entry['fields'])<32:entry['fields'].append({'table':record['namespace'],'row':record['gameId'],'field':field})
        for key,child in value.items():collect_references(child,record,field+'.'+key if field else key)
    elif isinstance(value,list):
        for index,child in enumerate(value):collect_references(child,record,f'{field}[{index}]')
for record in records:
    if record['id'].startswith('row:'):collect_references(record['details'],record)
for record in records:
    reference=references.get(record['namespace']+'::'+record['gameId']) if record['id'].startswith('loc:') else None
    if reference:
        record['details']['references']=reference['fields']
        record['details']['referenceCount']=reference['count']
        if len(reference['owners'])==1 and not record['ownerId']:record['ownerId']=next(iter(reference['owners']))
        elif len(reference['owners'])>1:record['details']['ownerIds']=sorted(reference['owners'])
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
report={'formatVersion':2,'locales':['ru','en','ja','zh'],'localizationKeys':len(translations),'records':len(records),'kinds':dict(Counter(r['kind'] for r in records)),'textures':len(images),'extractionErrors':manifest['failures'],'imageErrors':image_errors,'audioErrors':audio_errors,'emptyTables':sorted(set(empty)),'source':'Local installed game archives including PatchPaks; original strings preserved','datasetSha256':dataset_hash.hexdigest()}
report['chunks']=len(chunks)
report['repairedCsvRows']=dict(csv_repairs)
if supplement:report['supplement']={'providers':['Nanoka','Kaiden','Neverness.app'],'version':supplement['version'],'checkedAt':supplement['checkedAt'],'characters':len(supplement['characters']),'items':len(supplement['items']),'weapons':len(supplement['weapons']),'affinity':len(supplement.get('affinity',[])),'gifts':len(supplement.get('giftCatalog',{})),'failures':supplement['failures']}
report['chunksSha256']=hashlib.sha256((content/'chunks.jsonl.gz').read_bytes()).hexdigest()
(content/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(compact({k:report[k] for k in ['localizationKeys','records','kinds','textures']}))
if image_errors or audio_errors:raise SystemExit('Некоторые медиа не обработаны. Подробности сохранены в manifest.json; исправьте ошибки перед публикацией.')
cache_path.write_text(json.dumps(next_media_cache,separators=(',',':')),encoding='utf-8')

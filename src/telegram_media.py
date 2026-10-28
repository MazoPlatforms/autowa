"""Private Telegram channel catalog and authorized media downloader (Telethon StringSession)."""
import asyncio, json, os, sys, time, re, urllib.request, urllib.parse, difflib
from telethon import TelegramClient
from telethon.sessions import StringSession

def config():
    required = ('TELEGRAM_API_ID','TELEGRAM_API_HASH','TELEGRAM_SESSION','TELEGRAM_CHANNEL_ID')
    missing = [k for k in required if not os.getenv(k)]
    if missing: raise RuntimeError('Missing Telegram settings: '+', '.join(missing))
    return int(os.environ['TELEGRAM_API_ID']),os.environ['TELEGRAM_API_HASH'],os.environ['TELEGRAM_SESSION'],int(os.environ['TELEGRAM_CHANNEL_ID'])

def title_for(message):
    name=getattr(message.file,'name',None) or ''
    caption=(message.message or '').strip().splitlines()
    title=next((line.strip() for line in caption if line.strip()),'') or name or ('Movie '+str(message.id))
    return title[:140]


def clean_title(raw):
    raw=re.sub(r'(?i)\\.(mkv|mp4|avi|mov|webm)(\\.\\w+)?
    mode=sys.argv[1]
    api_id,api_hash,session,channel=config()
    async with TelegramClient(StringSession(session),api_id,api_hash,receive_updates=False) as client:
        dialogs=await client.get_dialogs(limit=None)
        entity=next((d.entity for d in dialogs if d.id==channel),None)
        if entity is None: raise RuntimeError('Configured private channel is not accessible to this Telegram session')
        if mode=='index':
            items=[]
            async for m in client.iter_messages(entity,limit=3000):
                if not m.file or not (m.video or m.document):continue
                size=int(getattr(m.file,'size',0) or 0)
                if size<=0 or size>2000000000:continue
                items.append(item_for(m))
            print(json.dumps({'movies':items,'indexed_at':int(time.time())}),flush=True)
        elif mode=='search':
            query=sys.argv[2].strip()[:100]
            if len(query)<2:print(json.dumps({'movies':[]}));return
            items=[]
            async for m in client.iter_messages(entity,search=query,limit=50):
                if not m.file or not (m.video or m.document):continue
                size=int(getattr(m.file,'size',0) or 0)
                if 0<size<=2000000000:items.append(item_for(m))
            print(json.dumps({'movies':items}),flush=True)
        elif mode=='download':
            mid=int(sys.argv[2]);destination=sys.argv[3]
            if mid<=0:raise ValueError('Invalid message id')
            m=await client.get_messages(entity,ids=mid)
            if not m or not m.file or not (m.video or m.document):raise ValueError('Movie no longer available')
            size=int(getattr(m.file,'size',0) or 0)
            if size<=0 or size>2000000000:raise ValueError('Invalid media size')
            last=[0]
            def progress(done,total):
                now=time.monotonic()
                if now-last[0]>=5 or done==total:
                    print('PROGRESS %d %d'%(done,total),flush=True)
                    last[0]=now
            await client.download_media(m,file=destination,progress_callback=progress)
            actual=os.path.getsize(destination)
            if actual!=size:raise ValueError('Incomplete Telegram download: %s / %s'%(actual,size))
            print('Downloaded %d bytes (%.2f MiB)'%(actual,actual/1048576),flush=True)
        else:raise ValueError('Unknown mode')

if __name__=='__main__':asyncio.run(main())
, '',raw or '')
    raw=re.sub(r'[._]+',' ',raw)
    raw=re.sub(r'(?i)\\b(2160p|1080p|720p|480p|4k|web[- ]?dl|webrip|bluray|brrip|hdrip|dvdrip|x264|x265|h264|h265|hevc|aac|ddp5?\\.?1|esub|multi|proper|repack|tamil|telugu|hindi|english)\\b.*
    mode=sys.argv[1]
    api_id,api_hash,session,channel=config()
    async with TelegramClient(StringSession(session),api_id,api_hash,receive_updates=False) as client:
        dialogs=await client.get_dialogs(limit=None)
        entity=next((d.entity for d in dialogs if d.id==channel),None)
        if entity is None: raise RuntimeError('Configured private channel is not accessible to this Telegram session')
        if mode=='index':
            items=[]
            async for m in client.iter_messages(entity,limit=3000):
                if not m.file or not (m.video or m.document):continue
                size=int(getattr(m.file,'size',0) or 0)
                if size<=0 or size>2000000000:continue
                items.append({'id':m.id,'title':title_for(m),'filename':(getattr(m.file,'name',None) or '')[:180],'size':size})
            print(json.dumps({'movies':items,'indexed_at':int(time.time())}),flush=True)
        elif mode=='download':
            mid=int(sys.argv[2]);destination=sys.argv[3]
            if mid<=0:raise ValueError('Invalid message id')
            m=await client.get_messages(entity,ids=mid)
            if not m or not m.file or not (m.video or m.document):raise ValueError('Movie no longer available')
            size=int(getattr(m.file,'size',0) or 0)
            if size<=0 or size>2000000000:raise ValueError('Invalid media size')
            last=[0]
            def progress(done,total):
                now=time.monotonic()
                if now-last[0]>=5 or done==total:
                    print('PROGRESS %d %d'%(done,total),flush=True)
                    last[0]=now
            await client.download_media(m,file=destination,progress_callback=progress)
            actual=os.path.getsize(destination)
            if actual!=size:raise ValueError('Incomplete Telegram download: %s / %s'%(actual,size))
            print('Downloaded %d bytes (%.2f MiB)'%(actual,actual/1048576),flush=True)
        else:raise ValueError('Unknown mode')

if __name__=='__main__':asyncio.run(main())
, '',raw)
    raw=re.sub(r'\\s+',' ',raw).strip(' -[]()')
    return raw[:140] or 'Untitled movie'

def canonical_title(raw):
    candidate=clean_title(raw)
    match=re.search(r'\\b(19\\d{2}|20\\d{2})\\b',candidate)
    year=int(match.group(1)) if match else None
    base=re.sub(r'\\s*[([]?(?:19\\d{2}|20\\d{2})[)\\]]?\\s*',' ',candidate).strip()
    if not base:return candidate,None
    # Cinemeta is a best-effort, keyless third-party metadata provider.
    # Only accept high-confidence matches; never fabricate titles.
    try:
        q=urllib.parse.quote(base,safe='')
        url='https://v3-cinemeta.strem.io/catalog/movie/top/search='+q+'.json'
        req=urllib.request.Request(url,headers={'User-Agent':'TamilFilmsWorld/1.0'})
        with urllib.request.urlopen(req,timeout=5) as resp:
            metas=json.load(resp).get('metas',[])[:10]
        for m in metas:
            name=str(m.get('name','')).strip()
            release=str(m.get('releaseInfo') or m.get('year') or '')
            found=re.search(r'\\b(19\\d{2}|20\\d{2})\\b',release)
            actual_year=int(found.group(1)) if found else None
            score=difflib.SequenceMatcher(None,base.casefold(),name.casefold()).ratio()
            if name and score>=0.94 and (not year or actual_year==year):
                return name+(' ('+str(actual_year)+')' if actual_year else ''),str(m.get('id',''))
    except Exception:
        pass
    return candidate,None

def item_for(m):
    filename=(getattr(m.file,'name',None) or '')[:180]
    raw=filename or title_for(m)
    title,imdb_id=canonical_title(raw)
    return {'id':m.id,'title':title,'filename':filename,'size':int(getattr(m.file,'size',0) or 0),'imdb_id':imdb_id}

async def main():
    mode=sys.argv[1]
    api_id,api_hash,session,channel=config()
    async with TelegramClient(StringSession(session),api_id,api_hash,receive_updates=False) as client:
        dialogs=await client.get_dialogs(limit=None)
        entity=next((d.entity for d in dialogs if d.id==channel),None)
        if entity is None: raise RuntimeError('Configured private channel is not accessible to this Telegram session')
        if mode=='index':
            items=[]
            async for m in client.iter_messages(entity,limit=3000):
                if not m.file or not (m.video or m.document):continue
                size=int(getattr(m.file,'size',0) or 0)
                if size<=0 or size>2000000000:continue
                items.append({'id':m.id,'title':title_for(m),'filename':(getattr(m.file,'name',None) or '')[:180],'size':size})
            print(json.dumps({'movies':items,'indexed_at':int(time.time())}),flush=True)
        elif mode=='download':
            mid=int(sys.argv[2]);destination=sys.argv[3]
            if mid<=0:raise ValueError('Invalid message id')
            m=await client.get_messages(entity,ids=mid)
            if not m or not m.file or not (m.video or m.document):raise ValueError('Movie no longer available')
            size=int(getattr(m.file,'size',0) or 0)
            if size<=0 or size>2000000000:raise ValueError('Invalid media size')
            last=[0]
            def progress(done,total):
                now=time.monotonic()
                if now-last[0]>=5 or done==total:
                    print('PROGRESS %d %d'%(done,total),flush=True)
                    last[0]=now
            await client.download_media(m,file=destination,progress_callback=progress)
            actual=os.path.getsize(destination)
            if actual!=size:raise ValueError('Incomplete Telegram download: %s / %s'%(actual,size))
            print('Downloaded %d bytes (%.2f MiB)'%(actual,actual/1048576),flush=True)
        else:raise ValueError('Unknown mode')

if __name__=='__main__':asyncio.run(main())

"""Private Telegram channel catalog and authorized media downloader (Telethon StringSession)."""
import asyncio, json, os, sys, time
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

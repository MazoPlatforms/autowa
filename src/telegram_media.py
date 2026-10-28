"""Private Telegram channel catalog, search, and authorized media download."""
import asyncio
import difflib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from telethon import TelegramClient
from telethon.sessions import StringSession

def config():
    keys = ('TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_SESSION', 'TELEGRAM_CHANNEL_ID')
    missing = [key for key in keys if not os.getenv(key)]
    if missing:
        raise RuntimeError('Missing Telegram settings: ' + ', '.join(missing))
    return int(os.environ[keys[0]]), os.environ[keys[1]], os.environ[keys[2]], int(os.environ[keys[3]])

def clean_title(raw):
    value = re.sub(r'(?i)\.(mkv|mp4|avi|mov|webm)(\.\w+)?$', '', raw or '')
    value = re.sub(r'[._]+', ' ', value)
    value = re.sub(r'(?i)\b(2160p|1080p|720p|480p|4k|web[- ]?dl|webrip|bluray|brrip|hdrip|dvdrip|x264|x265|h264|h265|hevc|aac|ddp5?\.?1|esub|multi|proper|repack)\b.*$', '', value)
    value = re.sub(r'\s+', ' ', value).strip(' -[]()')
    return value[:140] or 'Untitled movie'

def enrich_title(raw):
    candidate = clean_title(raw)
    year_match = re.search(r'\b(19\d{2}|20\d{2})\b', candidate)
    year = int(year_match.group(1)) if year_match else None
    base = re.sub(r'\s*[\[(]?(?:19\d{2}|20\d{2})[\])]?\s*', ' ', candidate).strip()
    if len(base) < 3:
        return candidate, None
    try:
        query = urllib.parse.quote(base, safe='')
        url = 'https://v3-cinemeta.strem.io/catalog/movie/top/search=' + query + '.json'
        req = urllib.request.Request(url, headers={'User-Agent': 'TamilFilmsWorld/1.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            metas = json.load(response).get('metas', [])[:10]
        for meta in metas:
            name = str(meta.get('name', '')).strip()
            release = str(meta.get('releaseInfo') or meta.get('year') or '')
            found = re.search(r'\b(19\d{2}|20\d{2})\b', release)
            release_year = int(found.group(1)) if found else None
            similarity = difflib.SequenceMatcher(None, base.casefold(), name.casefold()).ratio()
            if name and similarity >= 0.94 and (not year or release_year == year):
                canonical = name + (' (' + str(release_year) + ')' if release_year else '')
                return canonical[:140], str(meta.get('id', ''))
    except Exception:
        pass
    return candidate, None

def media_item(message, enrich=False):
    caption = message.message or ''
    fields = {}
    for line in caption.splitlines():
        match = re.match(r'^\\s*(Movie|Year|Quality)\\s*:\\s*(.*?)\\s*$', line, re.I)
        if match and match.group(2):
            fields[match.group(1).lower()] = match.group(2).strip()
    if not all(fields.get(key) for key in ('movie', 'year', 'quality')):
        return None
    title = fields['movie'][:140]
    year = fields['year']
    quality = fields['quality'][:40]
    if not re.fullmatch(r'(?:19|20)\\d{2}', year):
        return None
    if not re.fullmatch(r'[\\w .+-]{2,40}', quality):
        return None
    return {'id': message.id, 'title': title, 'year': year, 'quality': quality, 'size': int(getattr(message.file, 'size', 0) or 0)}

async def main():
    mode = sys.argv[1]
    api_id, api_hash, session, channel = config()
    async with TelegramClient(StringSession(session), api_id, api_hash, receive_updates=False) as client:
        dialogs = await client.get_dialogs(limit=None)
        entity = next((dialog.entity for dialog in dialogs if dialog.id == channel), None)
        if entity is None:
            raise RuntimeError('Telegram private channel not accessible to session')
        if mode == 'index':
            items = []
            async for message in client.iter_messages(entity, limit=3000):
                if not message.file or not (message.video or message.document):
                    continue
                size = int(getattr(message.file, 'size', 0) or 0)
                if 0 < size <= 2000000000:
                    item = media_item(message)
                    if item: items.append(item)
            print(json.dumps({'movies': items, 'indexed_at': int(time.time())}), flush=True)
        elif mode == 'search':
            query = sys.argv[2].strip()[:100]
            if len(query) < 2:
                print(json.dumps({'movies': []}))
                return
            items = []
            async for message in client.iter_messages(entity, search=query, limit=50):
                if not message.file or not (message.video or message.document):
                    continue
                size = int(getattr(message.file, 'size', 0) or 0)
                if 0 < size <= 2000000000:
                    item = media_item(message)
                    if item: items.append(item)
            print(json.dumps({'movies': items}), flush=True)
        elif mode == 'download':
            message_id = int(sys.argv[2])
            destination = sys.argv[3]
            if message_id <= 0:
                raise ValueError('Invalid message ID')
            message = await client.get_messages(entity, ids=message_id)
            if not message or not message.file or not (message.video or message.document):
                raise ValueError('Media not available')
            size = int(getattr(message.file, 'size', 0) or 0)
            if not 0 < size <= 2000000000:
                raise ValueError('Invalid media size')
            last = [0.0]
            def progress(done, total):
                now = time.monotonic()
                if now - last[0] >= 5 or done == total:
                    print('PROGRESS %d %d' % (done, total), flush=True)
                    last[0] = now
            await client.download_media(message, file=destination, progress_callback=progress)
            actual = os.path.getsize(destination)
            if actual != size:
                raise ValueError('Incomplete download: %d / %d' % (actual, size))
            print('Downloaded %d bytes (%.2f MiB)' % (actual, actual / 1048576), flush=True)
        else:
            raise ValueError('Unknown mode')

if __name__ == '__main__':
    asyncio.run(main())

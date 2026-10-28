"""Private Telegram channel catalog, search, and authorized media download."""
import asyncio
import difflib
import json
import os
import socket
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
        match = re.match(r'^\s*(Movie|Year|Quality)\s*:\s*(.*?)\s*$', line, re.I)
        if match and match.group(2):
            fields[match.group(1).lower()] = match.group(2).strip()
    if not all(fields.get(key) for key in ('movie', 'year', 'quality')):
        return None
    title = fields['movie'][:140]
    year = fields['year']
    quality = fields['quality'][:40]
    if not re.fullmatch(r'(?:19|20)\d{2}', year):
        return None
    if not re.fullmatch(r'[\w .+-]{2,40}', quality):
        return None
    return {'id': message.id, 'title': title, 'year': year, 'quality': quality, 'size': int(getattr(message.file, 'size', 0) or 0)}

async def main():
    mode = sys.argv[1]
    api_id, api_hash, session, channel = config()
    print('Telegram: connecting', file=sys.stderr, flush=True)
    try:
        socket.getaddrinfo('149.154.167.51',443)
        with socket.create_connection(('149.154.167.51',443),timeout=5):
            print('Telegram: DC TCP 443 reachable', file=sys.stderr, flush=True)
    except OSError as exc:
        print('Telegram: DC TCP 443 unreachable: '+type(exc).__name__+': '+str(exc),file=sys.stderr,flush=True)
    
    client = TelegramClient(StringSession(session), api_id, api_hash, receive_updates=False, timeout=8, connection_retries=0, request_retries=0)
    try:
        await asyncio.wait_for(client.connect(),timeout=15)
        if not client.is_connected():
            raise ConnectionError('Telegram MTProto connection not established')
        print('Telegram: connected', file=sys.stderr, flush=True)
        dialogs = await asyncio.wait_for(client.get_dialogs(limit=100), timeout=20)
        channel_id = int(str(abs(channel))[3:]) if str(abs(channel)).startswith('100') else abs(channel)
        entity = next((dialog.entity for dialog in dialogs if dialog.id == channel or getattr(dialog.entity, 'id', None) == channel_id), None)
        if entity is None:
            try:
                entity = await asyncio.wait_for(client.get_entity(channel), timeout=10)
            except (ValueError, TypeError):
                pass
        if entity is None:
            raise RuntimeError('Channel not accessible; check TELEGRAM_CHANNEL_ID and account membership')
        print('Telegram: channel resolved', file=sys.stderr, flush=True)
        if mode == 'index':
            items = []
            async for message in client.iter_messages(entity, limit=500):
                if not message.file or not (message.video or message.document):
                    continue
                size = int(getattr(message.file, 'size', 0) or 0)
                if 0 < size <= 2000000000:
                    item = media_item(message)
                    if item: items.append(item)
            print(json.dumps({'movies': items, 'indexed_at': int(time.time())}), flush=True)
        elif mode == 'recent':
            items = []
            async for message in client.iter_messages(entity, limit=100):
                if not message.file or not (message.video or message.document):
                    continue
                size = int(getattr(message.file, 'size', 0) or 0)
                if 0 < size <= 2000000000:
                    item = media_item(message)
                    if item: items.append(item)
                if len(items) >= 15: break
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
        elif mode == 'check':
            message_id = int(sys.argv[2])
            message = await client.get_messages(entity, ids=message_id)
            item = media_item(message) if message and message.file else None
            print(json.dumps({'movie': item}), flush=True)
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
    finally:
        await client.disconnect()

if __name__ == '__main__':
    try:
        asyncio.run(asyncio.wait_for(main(), timeout=50))
    except Exception as exc:
        print('Telegram failure: ' + type(exc).__name__ + ': ' + str(exc), file=sys.stderr, flush=True)
        sys.exit(1)

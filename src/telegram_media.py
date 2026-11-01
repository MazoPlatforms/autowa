"""Private Telegram channel catalog, search, and authorized media download."""
import asyncio
import difflib
import json
import os
import re
import secrets
import sys
import time
import traceback
import urllib.parse
import urllib.request
from telethon import TelegramClient
from telethon.sessions import StringSession

def config(channel_key='TELEGRAM_CHANNEL_ID'):
    keys = ('TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_SESSION', channel_key)
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

def anime_filename_parts(raw):
    """Parse common anime release names without requiring a fixed naming format."""
    value = re.sub(r'(?i)\.(mkv|mp4|avi|mov|webm)(\.\w+)?$', '', raw or '')
    value = re.sub(r'[._]+', ' ', value)
    episode = None
    season = None
    part = None
    match = re.search(r'(?i)\bS(\d{1,2})\s*(?:-|x)?\s*E(\d{1,4})\b', value)
    if match:
        season, episode = int(match.group(1)), int(match.group(2))
        value = value[:match.start()] + ' ' + value[match.end():]
    else:
        match = re.search(r'(?i)\b(?:season|s)\s*[- ]?(\d{1,2})\b', value)
        if match:
            season = int(match.group(1)); value = value[:match.start()] + ' ' + value[match.end():]
        match = re.search(r'(?i)\b(?:episode|ep|e)\s*[- ]?(\d{1,4})\b', value)
        if match:
            episode = int(match.group(1)); value = value[:match.start()] + ' ' + value[match.end():]
    if episode is None:
        match = re.search(r'(?<!\d)[- ]0*(\d{1,4})(?=\s*(?:\[[^]]*\]|\([^)]*\)|\b(?:720|1080|2160|4k)p?\b|$))', value, re.I)
        if match:
            episode = int(match.group(1)); value = value[:match.start()] + ' ' + value[match.end():]
    match = re.search(r'(?i)\bpart\s*[- ]?(\d{1,2})\b', value)
    if match:
        part = int(match.group(1)); value = value[:match.start()] + ' ' + value[match.end():]
    value = re.sub(r'(?i)\b(2160p|1080p|720p|480p|4k|web[- ]?dl|webrip|bluray|brrip|hdrip|dvdrip|x264|x265|h264|h265|hevc|aac|ddp5?\.?(?:1|2)?|esub|multi|proper|repack|uncut|dual audio)\b.*$', '', value)
    value = re.sub(r'\s+', ' ', value).strip(' -[]()')
    return (value[:140] or 'Untitled anime', season, episode, part)

def tmdb_season_boundaries(title):
    key = os.getenv('TMDB_API_KEY')
    if not key:
        return []
    try:
        params = urllib.parse.urlencode({'api_key': key, 'query': title, 'language': 'en-US'})
        with urllib.request.urlopen(urllib.request.Request('https://api.themoviedb.org/3/search/tv?' + params, headers={'User-Agent': 'FilmGo/1.0'}), timeout=6) as response:
            result = json.load(response).get('results', [])
        if not result or not result[0].get('id'):
            return []
        params = urllib.parse.urlencode({'api_key': key, 'language': 'en-US'})
        with urllib.request.urlopen(urllib.request.Request('https://api.themoviedb.org/3/tv/%s?%s' % (result[0]['id'], params), headers={'User-Agent': 'FilmGo/1.0'}), timeout=6) as response:
            seasons = json.load(response).get('seasons', [])
        return [(int(item.get('season_number')), int(item.get('episode_count') or 0)) for item in sorted(seasons, key=lambda item: int(item.get('season_number') or 0)) if int(item.get('season_number') or 0) > 0]
    except Exception:
        return []

def inferred_anime_season(episode, explicit, boundaries):
    if explicit:
        return explicit
    offset = 0
    for season, count in boundaries:
        if int(episode or 0) <= offset + count:
            return season
        offset += count
    return 1

def anime_metadata(raw_title):
    """Best-effort AniList enrichment; Telegram indexing still works offline."""
    title, _, _, _ = anime_filename_parts(raw_title)
    query = '''query ($search: String) { Media(search: $search, type: ANIME) { id title { romaji english native } coverImage { large } description(asHtml: false) genres averageScore status episodes startDate { year } studios { nodes { name } } } }'''
    try:
        payload = json.dumps({'query': query, 'variables': {'search': title}}).encode()
        request = urllib.request.Request('https://graphql.anilist.co', data=payload, headers={'Content-Type': 'application/json', 'User-Agent': 'FilmGo/1.0'})
        with urllib.request.urlopen(request, timeout=5) as response:
            media = json.load(response).get('data', {}).get('Media') or {}
        names = [media.get('title', {}).get(k) for k in ('english', 'romaji', 'native')]
        canonical = next((str(name).strip() for name in names if name), title)
        return {'title': canonical[:140], 'poster': media.get('coverImage', {}).get('large'), 'plot': re.sub(r'<[^>]+>', '', str(media.get('description') or '')).strip()[:900], 'genre': media.get('genres') or [], 'rating': round((float(media.get('averageScore') or 0) / 10), 1) or None, 'status': media.get('status', '').title() or None, 'episodes_total': media.get('episodes'), 'year': (media.get('startDate') or {}).get('year'), 'studio': (((media.get('studios') or {}).get('nodes') or [{}])[0]).get('name')}
    except Exception:
        return {'title': title}

def anime_media_item(message):
    filename = str(getattr(message.file, 'name', '') or '')
    if not filename or not getattr(message, 'file', None):
        return None
    title, season, episode, part = anime_filename_parts(filename)
    quality_match = re.search(r'(?i)\b(2160p|1080p|720p|480p|4k)\b', filename)
    quality = quality_match.group(1).upper() if quality_match else 'AUTO'
    size = int(getattr(message.file, 'size', 0) or 0)
    if not episode or not quality or not 0 < size <= 2000000000:
        return None
    return {'slug_id': secrets.token_urlsafe(12), 'telegram_message_id': int(message.id), 'episode': episode, 'season': season, 'season_explicit': bool(season), 'part': part, 'quality': quality, 'file_size': size, 'file_name': filename[:240], 'mime_type': str(getattr(message.file, 'mime_type', '') or '')}

def build_anime_catalog(messages):
    shows = {}
    for message in messages:
        item = anime_media_item(message)
        if not item:
            continue
        title, _, _, _ = anime_filename_parts(str(getattr(message.file, 'name', '') or ''))
        key = re.sub(r'[^a-z0-9]+', ' ', title.casefold()).strip()
        show = shows.setdefault(key, {'slug_id': re.sub(r'[^a-z0-9]+', '-', key).strip('-')[:80] or 'anime', 'title': title, 'episodes': []})
        show['episodes'].append(item)
    result = []
    for show in shows.values():
        meta = anime_metadata(show['title'])
        show.update({k: v for k, v in meta.items() if v not in (None, '', [])})
        boundaries = tmdb_season_boundaries(show['title'])
        for episode in show['episodes']:
            episode['season'] = inferred_anime_season(episode['episode'], episode.pop('season_explicit', None) and episode['season'], boundaries)
        show['episodes'].sort(key=lambda e: (e.get('season') or 1, e.get('episode') or 0, e.get('part') or 0, e.get('quality') or ''))
        show['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        result.append(show)
    return result

def media_item(message, enrich=False):
    caption = message.message or ''
    fields = {}
    for line in caption.splitlines():
        match = re.match(r'^\s*(Movie|Year|Quality)\s*:\s*(.*?)\s*$', line, re.I)
        if match and match.group(2):
            fields[match.group(1).lower()] = match.group(2).strip()
    # Filename fallback is conservative: unknown year/quality stays unindexed
    # rather than publishing fabricated metadata.
    filename = str(getattr(message.file, 'name', '') or '')
    if not fields.get('movie') and filename:
        fields['movie'] = re.sub(r'\\s*[\\[(]?(?:19\\d{2}|20\\d{2})[\\])]?', ' ', clean_title(filename)).strip()[:140]
    if not fields.get('year'):
        match = re.search(r'(?<!\d)(19\d{2}|20\d{2})(?!\d)', filename)
        if match: fields['year'] = match.group(1)
    if not fields.get('quality'):
        match = re.search(r'(?i)\b(2160p|1080p|720p|480p|4k)\b', filename)
        if match: fields['quality'] = match.group(1).upper()
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

def trace(stage, **details):
    safe = ' '.join('%s=%s' % (key, value) for key, value in details.items())
    print('Telegram diagnostic: %s%s' % (stage, ' '+safe if safe else ''), file=sys.stderr, flush=True)

async def main():
    mode = sys.argv[1]
    anime_mode = mode in ('index-anime', 'recent-anime', 'check-anime', 'download-anime')
    api_id, api_hash, session, channel = config('TELEGRAM_ANIME_CHANNEL_ID' if anime_mode else 'TELEGRAM_CHANNEL_ID')
    started = time.monotonic()
    trace('start', mode=mode, elapsed='0s')
    print('Telegram: connecting', file=sys.stderr, flush=True)
    trace('preflight probe skipped')
    client = TelegramClient(StringSession(session), api_id, api_hash, receive_updates=False, timeout=None, connection_retries=-1, request_retries=-1, auto_reconnect=True)
    trace('client configured', rpc_timeout='none', connection_retries='unlimited', request_retries='unlimited')
    try:
        await client.connect()
        if not client.is_connected():
            raise ConnectionError('Telegram MTProto connection not established')
        print('Telegram: connected', file=sys.stderr, flush=True)
        trace('resolving channel', elapsed_seconds=round(time.monotonic()-started, 2))
        dialogs = await client.get_dialogs(limit=100)
        channel_id = int(str(abs(channel))[3:]) if str(abs(channel)).startswith('100') else abs(channel)
        entity = next((dialog.entity for dialog in dialogs if dialog.id == channel or getattr(dialog.entity, 'id', None) == channel_id), None)
        if entity is None:
            try:
                entity = await client.get_entity(channel)
            except (ValueError, TypeError):
                pass
        if entity is None:
            raise RuntimeError('Channel not accessible; check TELEGRAM_CHANNEL_ID and account membership')
        print('Telegram: channel resolved', file=sys.stderr, flush=True)
        trace('channel resolved', elapsed_seconds=round(time.monotonic()-started, 2))
        if mode == 'index-anime':
            messages = []
            async for message in client.iter_messages(entity, limit=2000):
                if message.file and (message.video or message.document):
                    messages.append(message)
            print(json.dumps({'anime': build_anime_catalog(messages), 'indexed_at': int(time.time())}), flush=True)
        elif mode == 'index':
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
            trace('fetching media message', message_id=message_id)
            message = await client.get_messages(entity, ids=message_id)
            trace('media message fetched', message_id=message_id, has_file=bool(message and message.file), elapsed_seconds=round(time.monotonic()-started, 2))
            if not message or not message.file or not (message.video or message.document):
                raise ValueError('Media not available')
            size = int(getattr(message.file, 'size', 0) or 0)
            if not 0 < size <= 2000000000:
                raise ValueError('Invalid media size')
            trace('download starting', message_id=message_id, size_bytes=size, elapsed_seconds=round(time.monotonic()-started, 2))
            last = [0.0]
            def progress(done, total):
                now = time.monotonic()
                if now - last[0] >= 5 or done == total:
                    print('PROGRESS %d %d' % (done, total), flush=True)
                    trace('download progress', bytes_done=done, bytes_total=total, elapsed_seconds=round(now-started, 2))
                    last[0] = now
            await client.download_media(message, file=destination, progress_callback=progress)
            trace('download_media returned', elapsed_seconds=round(time.monotonic()-started, 2))
            actual = os.path.getsize(destination)
            if actual != size:
                raise ValueError('Incomplete download: %d / %d' % (actual, size))
            print('Downloaded %d bytes (%.2f MiB)' % (actual, actual / 1048576), flush=True)
        else:
            raise ValueError('Unknown mode')
    except Exception as exc:
        trace('operation failed', mode=mode, exception_type=type(exc).__name__, exception_repr=repr(exc), elapsed_seconds=round(time.monotonic()-started, 2))
        traceback.print_exc(file=sys.stderr)
        raise
    finally:
        trace('disconnecting', elapsed_seconds=round(time.monotonic()-started, 2))
        await client.disconnect()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except Exception as exc:
        print('Telegram failure: ' + type(exc).__name__ + ': ' + str(exc), file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

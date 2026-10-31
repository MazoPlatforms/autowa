"""FilmGo experimental Pyrogram raw range gateway.

The transfer path intentionally follows the reference bot's architecture:
cached Pyrogram FileId properties, persistent DC media sessions, aligned raw
upload.GetFile chunks, and least-loaded client selection. It is localhost-only;
FilmGo keeps authentication, token accounting and HTTP headers in Node.
"""
import asyncio
import collections
import contextlib
import json
import os
import time

# Pyrogram 2.0.x initialises its sync helpers at import time and expects a
# current event loop. Python 3.14 no longer creates one implicitly. Create the
# compatibility loop before importing Pyrogram; asyncio.run() owns the actual
# gateway loop later, so the streaming implementation remains unchanged.
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from pyrogram import Client, utils, raw, errors
from pyrogram.file_id import FileId, FileType, ThumbnailSource
from pyrogram.session import Session, Auth
from pyrogram.errors import AuthBytesInvalid

# Pyrogram 2.0.106 predates Telegram's larger channel-id range and rejects
# valid modern -100... IDs before it can resolve the channel. Keep Pyrogram's
# normal handling for every other peer and only widen that classification;
# get_channel_id() already converts the modern ID to the raw API value.
_pyrogram_get_peer_type = utils.get_peer_type


def _filmgo_get_peer_type(peer_id):
    if isinstance(peer_id, int) and peer_id <= -1000000000001:
        return "channel"
    return _pyrogram_get_peer_type(peer_id)


utils.get_peer_type = _filmgo_get_peer_type

HOST = "127.0.0.1"
PORT = int(os.getenv("FAST_STREAM_WORKER_PORT", "8766"))
PAGE = 4096
MIB = 1024 * 1024
REQUEST_SIZE = MIB                   # largest part Telegram allows
# First part of every range is small so the first byte reaches the player
# quickly (seek / first load); parts then double up to 1 MiB. Power of two.
FIRST_PART = max(PAGE, min(MIB, 1 << (int(os.getenv("STREAM_FIRST_PART_KIB", "128")) * 1024).bit_length() - 1))
PIPELINE = max(1, int(os.getenv("STREAM_PIPELINE", "3")))   # parts requested in parallel per stream
MAX_LENGTH = 32 * 1024 * 1024
MAX_STREAMS = int(os.getenv("STREAM_MAX_CONCURRENT", "6"))
CHUNK_TIMEOUT = 30
REF_TTL = int(os.getenv("STREAM_REF_TTL", "1800"))          # seconds a looked-up file is reused
REFRESH_INTERVAL = int(os.getenv("STREAM_REFRESH_SECONDS", "1200"))
CACHE_MAX = 256
PREWARM_MESSAGES = int(os.getenv("STREAM_PREWARM_MESSAGES", "40"))
PREWARM_TIMEOUT = int(os.getenv("STREAM_PREWARM_TIMEOUT", "25"))
CATALOG_PATH = os.getenv("FILMGO_CATALOG_PATH", "data/movies.json")
SOURCE_CHANNEL = int(os.environ["TELEGRAM_CHANNEL_ID"])

FileReferenceExpired = getattr(errors, "FileReferenceExpired", type("FileReferenceExpired", (Exception,), {}))


def media_from_message(message):
    for name in ("audio", "document", "photo", "video", "voice", "video_note", "animation"):
        media = getattr(message, name, None)
        if media:
            return media
    return None


def part_plan(start, length):
    """Yield (offset, limit) Telegram parts covering [start, start + length).

    Every part satisfies Telegram's rules under any reading of them: offset and
    limit are multiples of 4 KiB, limit is a power of two <= 1 MiB, offset is a
    multiple of limit (so a part never crosses a 1 MiB boundary). The first
    part is small (FIRST_PART) for a fast first byte, then sizes double.
    """
    end = start + length
    offset = start - start % FIRST_PART
    cap = FIRST_PART
    while offset < end:
        align = (offset & -offset) if offset else MIB      # largest power of two dividing offset
        limit = min(cap, align, MIB)
        while limit > PAGE and offset + limit // 2 >= end:   # do not over-fetch the tail
            limit //= 2
        yield offset, limit
        offset += limit
        cap = min(MIB, cap * 2)


def catalog_message_ids():
    """Message ids from the bundled catalog (newest first), used for pre-warming."""
    try:
        with open(CATALOG_PATH, encoding="utf-8") as handle:
            movies = json.load(handle).get("movies", [])
    except Exception as error:
        print(f"PREWARM catalog unavailable: {type(error).__name__}", flush=True)
        return []
    ids = []
    for movie in movies:
        entries = [movie] + list((movie.get("qualities") or {}).values())
        for entry in entries:
            value = entry.get("telegram_message_id") if isinstance(entry, dict) else None
            if isinstance(value, int) and value > 0 and value not in ids:
                ids.append(value)
    return ids


class ByteStreamer:
    def __init__(self, client):
        self.client = client
        self.cached_file_ids = {}
        # One lock per DC: two first-time viewers must not both create an auth key.
        self.session_locks = collections.defaultdict(asyncio.Lock)

    @staticmethod
    def file_id_from_message(message):
        if not message or getattr(message, "empty", False) or not message.file:
            return None
        media = media_from_message(message)
        if not media:
            return None
        file_id = FileId.decode(media.file_id)
        file_id.file_size = int(getattr(media, "file_size", 0) or 0)
        file_id.mime_type = getattr(media, "mime_type", "") or "application/octet-stream"
        file_id.file_name = getattr(media, "file_name", "") or ""
        file_id.unique_id = getattr(media, "file_unique_id", "") or ""
        return file_id

    def remember(self, message_id, file_id):
        self.cached_file_ids[message_id] = (file_id, time.time())
        while len(self.cached_file_ids) > CACHE_MAX:
            self.cached_file_ids.pop(next(iter(self.cached_file_ids)))

    async def get_file_properties(self, message_id, force=False):
        item = self.cached_file_ids.get(message_id)
        if item and not force and time.time() - item[1] < REF_TTL:
            return item[0]
        message = await self.client.get_messages(SOURCE_CHANNEL, message_id)
        file_id = self.file_id_from_message(message)
        if file_id is None:
            raise FileNotFoundError(f"Telegram message {message_id} has no supported media")
        self.remember(message_id, file_id)
        return file_id

    async def fetch_many(self, message_ids):
        """Look up many messages in as few Telegram calls as possible."""
        found = {}
        for index in range(0, len(message_ids), 100):
            batch = message_ids[index:index + 100]
            messages = await self.client.get_messages(SOURCE_CHANNEL, batch)
            if not isinstance(messages, (list, tuple)):
                messages = [messages]
            for message_id, message in zip(batch, messages):
                file_id = self.file_id_from_message(message)
                if file_id is not None:
                    self.remember(message_id, file_id)
                    found[message_id] = file_id
        return found

    async def media_session(self, file_id):
        session = self.client.media_sessions.get(file_id.dc_id)
        if session:
            return session
        async with self.session_locks[file_id.dc_id]:
            session = self.client.media_sessions.get(file_id.dc_id)
            if session:
                return session
            return await self._create_media_session(file_id)

    async def _create_media_session(self, file_id):
        if file_id.dc_id != await self.client.storage.dc_id():
            session = Session(self.client, file_id.dc_id, await Auth(self.client, file_id.dc_id, await self.client.storage.test_mode()).create(), await self.client.storage.test_mode(), is_media=True)
            await session.start()
            exported = await self.client.invoke(raw.functions.auth.ExportAuthorization(dc_id=file_id.dc_id))
            for _ in range(6):
                try:
                    await session.send(raw.functions.auth.ImportAuthorization(id=exported.id, bytes=exported.bytes))
                    break
                except AuthBytesInvalid:
                    continue
            else:
                await session.stop()
                raise AuthBytesInvalid
        else:
            session = Session(self.client, file_id.dc_id, await self.client.storage.auth_key(), await self.client.storage.test_mode(), is_media=True)
            await session.start()
        self.client.media_sessions[file_id.dc_id] = session
        return session

    @staticmethod
    async def location(file_id):
        if file_id.file_type == FileType.CHAT_PHOTO:
            if file_id.chat_id > 0:
                peer = raw.types.InputPeerUser(user_id=file_id.chat_id, access_hash=file_id.chat_access_hash)
            elif file_id.chat_access_hash == 0:
                peer = raw.types.InputPeerChat(chat_id=-file_id.chat_id)
            else:
                peer = raw.types.InputPeerChannel(channel_id=utils.get_channel_id(file_id.chat_id), access_hash=file_id.chat_access_hash)
            return raw.types.InputPeerPhotoFileLocation(peer=peer, volume_id=file_id.volume_id, local_id=file_id.local_id, big=file_id.thumbnail_source == ThumbnailSource.CHAT_PHOTO_BIG)
        if file_id.file_type == FileType.PHOTO:
            return raw.types.InputPhotoFileLocation(id=file_id.media_id, access_hash=file_id.access_hash, file_reference=file_id.file_reference, thumb_size=file_id.thumbnail_size)
        return raw.types.InputDocumentFileLocation(id=file_id.media_id, access_hash=file_id.access_hash, file_reference=file_id.file_reference, thumb_size=file_id.thumbnail_size)

    async def first_part(self, file_id, offset, limit):
        session = await self.media_session(file_id)
        result = await session.send(raw.functions.upload.GetFile(location=await self.location(file_id), offset=offset, limit=limit))
        if not isinstance(result, raw.types.upload.File) or not result.bytes:
            raise IOError("Telegram returned no bytes")
        return session, result.bytes

    async def parts(self, file_id, start, length):
        """Yield (offset, bytes) for consecutive Telegram parts covering the range.

        Up to PIPELINE GetFile requests are in flight at once (the session
        multiplexes them), and parts are delivered strictly in order. Closing
        the generator cancels whatever is still in flight.
        """
        session = await self.media_session(file_id)
        location = await self.location(file_id)
        plan = part_plan(start, length)
        inflight = collections.deque()

        async def fetch(offset, limit):
            result = await asyncio.wait_for(
                session.send(raw.functions.upload.GetFile(location=location, offset=offset, limit=limit)),
                CHUNK_TIMEOUT)
            if not isinstance(result, raw.types.upload.File):
                raise IOError("Telegram returned an unexpected response")
            return result.bytes

        def fill():
            while len(inflight) < PIPELINE:
                part = next(plan, None)
                if part is None:
                    return
                inflight.append((part[0], asyncio.ensure_future(fetch(*part))))

        try:
            fill()
            while inflight:
                offset, task = inflight.popleft()
                data = await task
                fill()
                yield offset, data
        finally:
            pending = [task for _, task in inflight]
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

    async def warm(self, message_id):
        file_id = await self.get_file_properties(message_id)
        await self.media_session(file_id)

    async def refresh_loop(self):
        """Keep file references fresh and the cache warm (no periodic cold start)."""
        while True:
            await asyncio.sleep(REFRESH_INTERVAL)
            ids = list(self.cached_file_ids)
            if not ids:
                continue
            try:
                await self.fetch_many(ids)
            except Exception as error:
                print(f"REFRESH failed {type(error).__name__}", flush=True)


class Gateway:
    def __init__(self):
        self.clients = {}
        self.streamers = {}
        self.loads = {}
        self.slots = asyncio.Semaphore(MAX_STREAMS)
        self.load_lock = asyncio.Lock()
        self.entity_ready = False
        self.background = []

    async def start(self):
        api_id = int(os.environ["TELEGRAM_API_ID"])
        api_hash = os.environ["TELEGRAM_API_HASH"]
        default_token = os.environ.get("STREAM_BOT_TOKEN") or os.environ.get("BOT_TOKEN")
        tokens = [default_token] if default_token else []
        tokens.extend(value for key, value in sorted(os.environ.items()) if key.startswith("STREAM_MULTI_TOKEN") and value)
        if not tokens:
            raise RuntimeError("STREAM_BOT_TOKEN, BOT_TOKEN, or STREAM_MULTI_TOKEN* is required")
        print(f"STARTING fast-pyrogram clients={len(tokens)} source_channel={SOURCE_CHANNEL}", flush=True)
        for index, token in enumerate(tokens):
            print(f"AUTHENTICATING fast-pyrogram client={index + 1}/{len(tokens)}", flush=True)
            client = Client(name=f"filmgo-fast-{index}", api_id=api_id, api_hash=api_hash, bot_token=token, no_updates=True, in_memory=True, sleep_threshold=60)
            await client.start()
            # Verify every configured client can actually read FilmGo's
            # source channel before including it in the load balancer.
            print(f"VERIFYING fast-pyrogram client={index + 1}/{len(tokens)} channel_access", flush=True)
            await client.get_chat(SOURCE_CHANNEL)
            self.clients[index] = client
            self.streamers[index] = ByteStreamer(client)
            self.loads[index] = 0
        self.entity_ready = True

    async def prewarm(self):
        """Resolve the newest catalog files and open a media session for every
        DC they live in, so the first viewer does not pay for a Telegram
        lookup or a new auth key (DH exchange, ~1-3 s)."""
        ids = catalog_message_ids()[:PREWARM_MESSAGES]
        if not ids:
            return
        started = time.time()

        async def warm_client(streamer):
            files = await streamer.fetch_many(ids)
            by_dc = {}
            for file_id in files.values():
                by_dc.setdefault(file_id.dc_id, file_id)
            results = await asyncio.gather(*(streamer.media_session(f) for f in by_dc.values()), return_exceptions=True)
            failed = sum(isinstance(r, Exception) for r in results)
            return len(files), sorted(by_dc), failed

        outcomes = await asyncio.gather(*(warm_client(s) for s in self.streamers.values()), return_exceptions=True)
        for index, outcome in enumerate(outcomes):
            if isinstance(outcome, Exception):
                print(f"PREWARM client={index + 1} failed {type(outcome).__name__}", flush=True)
            else:
                files, dcs, failed = outcome
                print(f"PREWARM client={index + 1} files={files} dcs={dcs} failed_sessions={failed} in {time.time() - started:.1f}s", flush=True)

    def start_background(self):
        for streamer in self.streamers.values():
            self.background.append(asyncio.create_task(streamer.refresh_loop()))

    async def warm(self, message_id):
        await asyncio.gather(*(s.warm(message_id) for s in self.streamers.values()), return_exceptions=True)

    async def serve(self, message_id, start, length, writer):
        if not self.entity_ready:
            raise RuntimeError("gateway is not ready")
        await asyncio.wait_for(self.slots.acquire(), 5)
        index = None
        try:
            # Reserve a stream slot first, then choose and account the client
            # without an await between selection and increment.  This keeps
            # queued requests from selecting the same stale minimum load.
            async with self.load_lock:
                index = min(self.loads, key=self.loads.get)
                self.loads[index] += 1
            streamer = self.streamers[index]
            file_id = await streamer.get_file_properties(message_id)
            size = int(file_id.file_size)
            if start < 0 or start >= size or length <= 0:
                raise ValueError("invalid range")
            end = start + min(length, size - start)
            pos = start                       # next byte the viewer needs
            header_sent = False
            file_reference_retries = 0
            while pos < end:
                try:
                    async with contextlib.aclosing(streamer.parts(file_id, pos, end - pos)) as parts:
                        async for offset, data in parts:
                            # Do not acknowledge the HTTP response until Telegram
                            # has returned the first part. A pre-fetch failure
                            # then stays recoverable by the Node fallback.
                            if offset > pos:
                                raise IOError("gap in Telegram parts")
                            low = pos - offset
                            high = min(end, offset + len(data)) - offset
                            if high <= low:
                                raise IOError("short Telegram part")
                            chunk = data[low:high]
                            if not header_sent:
                                writer.write(b"OK\n")
                                await writer.drain()
                                header_sent = True
                            writer.write(chunk)
                            await writer.drain()      # back-pressure: slow viewer = slow Telegram
                            pos += len(chunk)
                            if pos >= end:
                                break
                    if pos < end:
                        raise IOError("incomplete Telegram range")
                    return
                except FileReferenceExpired:
                    # Refresh the file reference and continue from the next
                    # byte the viewer still needs. No second protocol header is
                    # written, so delivered bytes are never duplicated.
                    if file_reference_retries >= 1:
                        return
                    file_reference_retries += 1
                    streamer.cached_file_ids.pop(message_id, None)
                    file_id = await streamer.get_file_properties(message_id, force=True)
                except Exception:
                    # Never append an ERR line after a successful response
                    # header; that would become corrupt media on the client.
                    if header_sent:
                        return
                    raise
        finally:
            if index is not None:
                self.loads[index] -= 1
            self.slots.release()


async def main():
    gateway = Gateway()
    await gateway.start()
    try:
        await asyncio.wait_for(gateway.prewarm(), PREWARM_TIMEOUT)
    except Exception as error:
        print(f"PREWARM skipped {type(error).__name__}", flush=True)
    gateway.start_background()
    server = await asyncio.start_server(lambda r, w: handle(gateway, r, w), HOST, PORT)
    print(f"READY fast-pyrogram clients={len(gateway.clients)} port={PORT} first_part={FIRST_PART // 1024}KiB pipeline={PIPELINE}", flush=True)
    async with server:
        await server.serve_forever()


async def handle(gateway, reader, writer):
    try:
        line = await asyncio.wait_for(reader.readline(), 5)
        if not line:
            return
        words = line.decode().split()
        if words and words[0] == "WARM":
            # Optional hint from Node: prepare this file while auth/token checks run.
            await asyncio.wait_for(gateway.warm(int(words[1])), 10)
            writer.write(b"WARMED\n")
            await writer.drain()
            return
        message_id, start, length = map(int, words)
        if length > MAX_LENGTH:
            raise ValueError("range too large")
        await gateway.serve(message_id, start, length, writer)
    except Exception as error:
        try:
            writer.write(f"ERR {type(error).__name__} {error}\n".encode()); await writer.drain()
        except Exception:
            pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(main())

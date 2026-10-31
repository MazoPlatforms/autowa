"""FilmGo experimental Pyrogram raw range gateway.

The transfer path intentionally follows the reference bot's architecture:
cached Pyrogram FileId properties, persistent DC media sessions, aligned raw
upload.GetFile chunks, and least-loaded client selection. It is localhost-only;
FilmGo keeps authentication, token accounting and HTTP headers in Node.
"""
import asyncio
import collections
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
REQUEST_SIZE = 1024 * 1024
MAX_LENGTH = 32 * 1024 * 1024
MAX_STREAMS = int(os.getenv("STREAM_MAX_CONCURRENT", "6"))
QUEUE_DEPTH = 4
CHUNK_TIMEOUT = 30
REF_TTL = 600
CACHE_MAX = 256
SOURCE_CHANNEL = int(os.environ["TELEGRAM_CHANNEL_ID"])

FileReferenceExpired = getattr(errors, "FileReferenceExpired", type("FileReferenceExpired", (Exception,), {}))


def media_from_message(message):
    for name in ("audio", "document", "photo", "video", "voice", "video_note", "animation"):
        media = getattr(message, name, None)
        if media:
            return media
    return None


class ByteStreamer:
    def __init__(self, client):
        self.client = client
        self.cached_file_ids = {}
        self.clean_task = asyncio.create_task(self.clean_cache())

    async def get_file_properties(self, message_id, force=False):
        item = self.cached_file_ids.get(message_id)
        if item and not force and time.time() - item[1] < REF_TTL:
            return item[0]
        message = await self.client.get_messages(SOURCE_CHANNEL, message_id)
        if not message or not message.file:
            raise FileNotFoundError(f"Telegram message {message_id} has no media")
        media = media_from_message(message)
        if not media:
            raise FileNotFoundError(f"Telegram message {message_id} has no supported media")
        file_id = FileId.decode(media.file_id)
        file_id.file_size = int(getattr(media, "file_size", 0) or 0)
        file_id.mime_type = getattr(media, "mime_type", "") or "application/octet-stream"
        file_id.file_name = getattr(media, "file_name", "") or ""
        file_id.unique_id = getattr(media, "file_unique_id", "") or ""
        self.cached_file_ids[message_id] = (file_id, time.time())
        while len(self.cached_file_ids) > CACHE_MAX:
            self.cached_file_ids.pop(next(iter(self.cached_file_ids)))
        return file_id

    async def media_session(self, file_id):
        session = self.client.media_sessions.get(file_id.dc_id)
        if session:
            return session
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

    async def stream(self, file_id, offset, length):
        session = await self.media_session(file_id)
        location = await self.location(file_id)
        while length > 0:
            result = await asyncio.wait_for(session.send(raw.functions.upload.GetFile(location=location, offset=offset, limit=REQUEST_SIZE)), CHUNK_TIMEOUT)
            if not isinstance(result, raw.types.upload.File) or not result.bytes:
                break
            data = result.bytes[:length]
            yield data
            offset += len(result.bytes)
            length -= len(data)

    async def clean_cache(self):
        while True:
            await asyncio.sleep(30 * 60)
            self.cached_file_ids.clear()


class Gateway:
    def __init__(self):
        self.clients = {}
        self.streamers = {}
        self.loads = {}
        self.slots = asyncio.Semaphore(MAX_STREAMS)
        self.load_lock = asyncio.Lock()
        self.entity_ready = False

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
            length = min(length, size - start)
            aligned = start - start % REQUEST_SIZE
            skip = start - aligned
            header_sent = False
            telegram_offset = aligned
            file_reference_retries = 0
            remaining = length
            skipped = skip
            while remaining > 0:
                try:
                    async for chunk in streamer.stream(file_id, telegram_offset, skipped + remaining):
                        # Do not acknowledge the HTTP response until Telegram
                        # has returned the first raw chunk.  This keeps a
                        # pre-fetch failure recoverable by the Node fallback.
                        if not header_sent:
                            writer.write(b"OK\n")
                            await writer.drain()
                            header_sent = True
                        telegram_offset += len(chunk)
                        if skipped:
                            drop = min(skipped, len(chunk)); chunk = chunk[drop:]; skipped -= drop
                        if chunk:
                            chunk = chunk[:remaining]
                            writer.write(chunk); await writer.drain(); remaining -= len(chunk)
                        if remaining <= 0: break
                    if remaining: raise IOError("incomplete Telegram range")
                    return
                except FileReferenceExpired:
                    # Refresh the file reference and continue from the next
                    # unread Telegram offset.  No second protocol header is
                    # written, so already delivered bytes are not duplicated.
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
            self.loads[index] -= 1
            self.slots.release()


async def main():
    gateway = Gateway()
    await gateway.start()
    server = await asyncio.start_server(lambda r, w: handle(gateway, r, w), HOST, PORT)
    print(f"READY fast-pyrogram clients={len(gateway.clients)} port={PORT}", flush=True)
    async with server:
        await server.serve_forever()


async def handle(gateway, reader, writer):
    try:
        line = await asyncio.wait_for(reader.readline(), 5)
        if not line:
            return
        message_id, start, length = map(int, line.decode().split())
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
        await writer.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())

"""Persistent Telegram range-streaming server (localhost only).

Replaces the old "spawn python3 for every Range request" design. One Telethon
client stays connected for the life of the container, so a request no longer
pays for process start-up, Telegram connect, authorization and a 100-dialog
lookup. Many viewers share the single MTProto connection.

Protocol (TCP, 127.0.0.1 only), one request per connection:
  client -> "<message_id> <start> <length>\n"      (or "PING\n")
  server -> "OK\n" + exactly <length> raw bytes    (or "PONG\n")
         -> "ERR <http_status> <message>\n"        (before any bytes)
"""
import asyncio
import collections
import os
import signal
import sys
import time

from telethon import TelegramClient, errors
from telethon.sessions import StringSession

HOST = "127.0.0.1"
PORT = int(os.getenv("STREAM_WORKER_PORT", "8765"))
REQUEST_SIZE = 512 * 1024            # Telegram max-friendly aligned part size
MAX_LENGTH = 32 * 1024 * 1024        # same cap as the HTTP layer
MAX_STREAMS = int(os.getenv("STREAM_MAX_CONCURRENT", "6"))
QUEUE_DEPTH = 4                      # chunks buffered per stream (~2 MiB)
CHUNK_TIMEOUT = 30                   # seconds to wait for one Telegram part
ACQUIRE_TIMEOUT = 5                  # seconds to wait for a free stream slot
REF_TTL = 600                        # seconds a looked-up message is reused
CACHE_MAX = 256


def log(*parts):
    print(*parts, file=sys.stderr, flush=True)


class GatewayError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _err(name):
    return getattr(errors, name, None) or type("Missing" + name, (Exception,), {})


FloodWait = _err("FloodWaitError")
FileRefExpired = _err("FileReferenceExpiredError")
AUTH_ERRORS = tuple(_err(n) for n in (
    "AuthKeyUnregisteredError", "AuthKeyInvalidError", "SessionRevokedError",
    "SessionExpiredError", "UnauthorizedError", "AuthKeyDuplicatedError"))


class Gateway:
    def __init__(self):
        self.client = None
        self.entity = None
        self.ready = False
        self.slots = asyncio.Semaphore(MAX_STREAMS)
        self.cache = collections.OrderedDict()   # message_id -> (media, size, ts)
        self.lookup_lock = asyncio.Lock()
        self.active = 0

    async def start(self):
        channel = int(os.environ["TELEGRAM_CHANNEL_ID"])
        self.client = TelegramClient(
            StringSession(os.environ["TELEGRAM_SESSION"]),
            int(os.environ["TELEGRAM_API_ID"]),
            os.environ["TELEGRAM_API_HASH"],
            receive_updates=False,
            connection_retries=5,
            request_retries=3,
            flood_sleep_threshold=0,
        )
        await asyncio.wait_for(self.client.connect(), timeout=20)
        if not await self.client.is_user_authorized():
            raise PermissionError("Telegram session not authorized")
        self.entity = await self.resolve_entity(channel)
        self.ready = True

    async def resolve_entity(self, channel):
        # Same resolution strategy as telegram_media.py / the old streamer.
        dialogs = await asyncio.wait_for(self.client.get_dialogs(limit=100), timeout=25)
        raw = abs(channel)
        bare = int(str(raw)[3:]) if str(raw).startswith("100") else raw
        entity = next((d.entity for d in dialogs
                       if d.id == channel or getattr(d.entity, "id", None) == bare), None)
        if entity is None:
            entity = await self.client.get_entity(channel)
        return entity

    async def ensure_connected(self):
        if not self.client.is_connected():
            log("telegram reconnecting")
            await asyncio.wait_for(self.client.connect(), timeout=15)

    async def media_for(self, message_id, force=False):
        now = time.time()
        hit = self.cache.get(message_id)
        if hit and not force and now - hit[2] < REF_TTL:
            self.cache.move_to_end(message_id)
            return hit[0], hit[1]
        async with self.lookup_lock:            # de-duplicate concurrent lookups
            hit = self.cache.get(message_id)
            if hit and not force and time.time() - hit[2] < REF_TTL:
                return hit[0], hit[1]
            msg = await asyncio.wait_for(
                self.client.get_messages(self.entity, ids=message_id), timeout=15)
            if not msg or not msg.file or not (msg.video or msg.document):
                raise GatewayError(404, "Media unavailable")
            size = int(msg.file.size or 0)
            if size <= 0:
                raise GatewayError(404, "Media unavailable")
            self.cache[message_id] = (msg.media, size, time.time())
            while len(self.cache) > CACHE_MAX:
                self.cache.popitem(last=False)
            return msg.media, size

    def open_iterator(self, media, size, aligned, chunks):
        return self.client.iter_download(
            media, offset=aligned, limit=chunks, request_size=REQUEST_SIZE,
            chunk_size=REQUEST_SIZE, file_size=size)

    async def first_chunk(self, message_id, start, remaining):
        aligned = start - start % REQUEST_SIZE
        chunks = -(-(start - aligned + remaining) // REQUEST_SIZE)
        for attempt in (0, 1):
            media, size = await self.media_for(message_id, force=bool(attempt))
            if start >= size:
                raise GatewayError(416, "Range exceeds media")
            it = self.open_iterator(media, size, aligned, chunks)
            try:
                first = await asyncio.wait_for(it.__anext__(), timeout=CHUNK_TIMEOUT)
                return it, bytes(first), size
            except StopAsyncIteration:
                raise GatewayError(502, "Telegram returned no data")
            except FileRefExpired:
                self.cache.pop(message_id, None)   # refresh the file reference once
                if attempt:
                    raise
        raise GatewayError(502, "Telegram media could not be retrieved")

    async def serve(self, message_id, start, length, writer):
        if not self.ready:
            raise GatewayError(503, "Telegram gateway starting")
        await self.ensure_connected()
        try:
            await asyncio.wait_for(self.slots.acquire(), timeout=ACQUIRE_TIMEOUT)
        except asyncio.TimeoutError:
            raise GatewayError(503, "Streaming capacity reached, retry shortly")
        self.active += 1
        producer = None
        it = None
        try:
            size = (await self.media_for(message_id))[1]
            remaining = min(length, size - start) if start < size else 0
            if remaining <= 0:
                raise GatewayError(416, "Range exceeds media")
            it, first, size = await self.first_chunk(message_id, start, remaining)
            skip = start % REQUEST_SIZE
            if len(first) <= skip:
                raise GatewayError(502, "Telegram returned a short part")

            queue = asyncio.Queue(maxsize=QUEUE_DEPTH)

            async def produce():
                try:
                    await queue.put(first)
                    while True:
                        chunk = await asyncio.wait_for(it.__anext__(), timeout=CHUNK_TIMEOUT)
                        await queue.put(bytes(chunk))
                except StopAsyncIteration:
                    await queue.put(None)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:       # delivered to the consumer
                    await queue.put(exc)

            writer.write(b"OK\n")
            producer = asyncio.create_task(produce())
            to_skip = skip
            while remaining > 0:
                item = await queue.get()
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                if to_skip:
                    drop = min(to_skip, len(item))
                    item = item[drop:]
                    to_skip -= drop
                    if not item:
                        continue
                data = item[:remaining]
                writer.write(data)
                await writer.drain()            # back-pressure: slow viewer = slow Telegram
                remaining -= len(data)
            if remaining:
                raise IOError("Telegram returned an incomplete range")
        finally:
            if producer:
                producer.cancel()
                try:
                    await producer
                except BaseException:
                    pass
            if it is not None:
                close = getattr(it, "close", None)
                try:
                    if close:
                        res = close()
                        if asyncio.iscoroutine(res):
                            await asyncio.wait_for(res, timeout=3)
                except Exception:
                    pass
            self.active -= 1
            self.slots.release()

    async def handle(self, reader, raw_writer):
        writer = TrackedWriter(raw_writer)
        try:
            line = await asyncio.wait_for(reader.readline(), timeout=5)
            parts = line.decode("ascii", "ignore").split()
            if parts == ["PING"]:
                writer.write(("PONG %d\n" % self.active).encode())
                await writer.drain()
                return
            try:
                message_id, start, length = (int(x) for x in parts)
            except ValueError:
                raise GatewayError(400, "Bad request")
            if message_id <= 0 or start < 0 or length <= 0 or length > MAX_LENGTH:
                raise GatewayError(400, "Invalid media range")
            await self.serve(message_id, start, length, writer)
        except GatewayError as exc:
            await self._fail(writer, exc.status, exc.message)
        except FloodWait as exc:
            await self._fail(writer, 429, "Telegram rate limit, retry in %ss" % getattr(exc, "seconds", "?"))
        except AUTH_ERRORS:
            self.ready = False
            log("AUTH_FAILED during stream")
            await self._fail(writer, 503, "Telegram session invalid")
        except (ConnectionError, asyncio.CancelledError):
            pass                                  # viewer went away
        except asyncio.TimeoutError:
            await self._fail(writer, 504, "Telegram timed out")
        except Exception as exc:
            log("stream error", type(exc).__name__, str(exc)[:200])
            await self._fail(writer, 502, "Telegram media could not be retrieved")
        finally:
            try:
                writer.close()
            except Exception:
                pass

    @staticmethod
    async def _fail(writer, status, message):
        try:
            # Only possible before "OK\n" was written; harmless otherwise.
            if not getattr(writer, "sent_ok", False):
                writer.write(("ERR %d %s\n" % (status, message.replace("\n", " "))).encode())
                await writer.drain()
        except Exception:
            pass


class TrackedWriter:
    """StreamWriter proxy that remembers whether the OK line was sent, so an
    error status is only ever written before any media bytes."""
    def __init__(self, writer):
        self._w = writer
        self.sent_ok = False

    def write(self, data):
        if data == b"OK\n":
            self.sent_ok = True
        self._w.write(data)

    async def drain(self):
        await self._w.drain()

    def close(self):
        self._w.close()


async def main():
    gateway = Gateway()
    try:
        await gateway.start()
    except (PermissionError,) + AUTH_ERRORS as exc:
        print("AUTH_FAILED", flush=True)
        log("authorization failed:", type(exc).__name__)
        sys.exit(3)

    server = await asyncio.start_server(gateway.handle, HOST, PORT, backlog=64)
    print("READY", flush=True)
    log("stream worker listening on", HOST, PORT, "max streams", MAX_STREAMS)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:
            pass
    await stop.wait()
    server.close()
    try:
        await asyncio.wait_for(gateway.client.disconnect(), timeout=5)
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())
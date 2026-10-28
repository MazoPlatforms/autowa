"""Stream an authorized Telegram video range to stdout without saving it locally."""
import asyncio
import os
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession

async def main():
    message_id, start, length = map(int, sys.argv[1:4])
    if message_id <= 0 or start < 0 or length <= 0 or length > 4 * 1024 * 1024:
        raise ValueError("Invalid media range")
    channel = int(os.environ["TELEGRAM_CHANNEL_ID"])
    client = TelegramClient(
        StringSession(os.environ["TELEGRAM_SESSION"]),
        int(os.environ["TELEGRAM_API_ID"]),
        os.environ["TELEGRAM_API_HASH"],
        receive_updates=False,
        connection_retries=1,
        request_retries=1,
    )
    await asyncio.wait_for(client.connect(), timeout=15)
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session not authorized")
        dialogs = await asyncio.wait_for(client.get_dialogs(limit=100), timeout=20)
        raw = abs(channel)
        channel_id = int(str(raw)[3:]) if str(raw).startswith("100") else raw
        entity = next((d.entity for d in dialogs if d.id == channel or getattr(d.entity, "id", None) == channel_id), None)
        if entity is None:
            entity = await client.get_entity(channel)
        msg = await client.get_messages(entity, ids=message_id)
        if not msg or not msg.file or not (msg.video or msg.document):
            raise ValueError("Media unavailable")
        size = int(msg.file.size or 0)
        if start >= size:
            raise ValueError("Range exceeds media")
        remaining = min(length, size - start)
        # Telethon supports offsets with iter_download; request_size is aligned.
        async for chunk in client.iter_download(msg.media, offset=start, request_size=256 * 1024, chunk_size=256 * 1024):
            data = bytes(chunk)
            if not data:
                break
            data = data[:remaining]
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
            remaining -= len(data)
            if remaining <= 0:
                break
        if remaining:
            raise IOError("Telegram returned an incomplete range")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

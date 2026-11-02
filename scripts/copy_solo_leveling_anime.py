"""Copy Solo Leveling document uploads into FilmGo's anime channel.

Only MKV/MP4 files uploaded as documents are accepted. Telegram video messages,
other media, and non-Solo-Leveling filenames are ignored.
"""
import asyncio
import os
import re
import sys
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.telegram_media import anime_filename_parts, anime_parent_slug, anime_special_type


SOURCE = os.getenv("SOURCE_CHANNEL", "Solo_leveling_tamil_ongoing")
TITLE = "Solo Leveling"
SLUG = "solo-leveling"
DRY_RUN = os.getenv("DRY_RUN", "0") == "1"


def quality_of(filename):
    match = re.search(r"(?i)(2160l?p|1080l?p|720l?p|480l?p|360l?p|4k)(?=[^a-z0-9]|$)", filename)
    return (match.group(1) if match else "720p").lower().replace("lp", "p")


def caption_for(filename):
    title, season, episode, part = anime_filename_parts(filename)
    key = re.sub(r"[^a-z0-9]+", "", title.casefold())
    if key != "sololeveling" or episode is None:
        return None
    season = season or 1
    special_type = anime_special_type(filename)
    quality = quality_of(filename)
    parent = anime_parent_slug(TITLE, season, episode, special_type, part)
    caption = "\n".join((
        f"Anime: {TITLE}",
        f"Anime Slug ID: {SLUG}",
        f"Season: {season}",
        f"Episode: {episode}",
        f"Quality: {quality}",
        f"Episode Slug ID: {parent}",
    ))
    return caption, (season, episode, part or 0, quality)


def caption_identity(text):
    text = str(text or "")
    if not re.search(r"(?im)^\s*Anime Slug ID\s*:\s*solo-leveling\s*$", text):
        return None
    def number(label, default=None):
        match = re.search(rf"(?im)^\s*{label}\s*:\s*(\d+)\s*$", text)
        return int(match.group(1)) if match else default
    quality = re.search(r"(?im)^\s*Quality\s*:\s*(\S+)", text)
    return (number("Season", 1), number("Episode"), 0, (quality.group(1).lower() if quality else "720p"))


async def main():
    required = ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION", "TELEGRAM_ANIME_CHANNEL_ID")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing Telegram settings: " + ", ".join(missing))

    client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"])
    await client.start()
    source = await client.get_entity(SOURCE)
    target = await client.get_entity(int(os.environ["TELEGRAM_ANIME_CHANNEL_ID"]))
    source_items = {}
    target_items = set()
    copied = skipped = 0
    try:
        async for message in client.iter_messages(target, limit=None):
            identity = caption_identity(getattr(message, "raw_text", ""))
            if identity:
                target_items.add(identity)

        async for message in client.iter_messages(source, reverse=True):
            # Video messages are deliberately excluded, even when their filename is MKV/MP4.
            if not message.file or message.video:
                continue
            filename = str(message.file.name or "")
            if not re.search(r"(?i)\.(mkv|mp4)$", filename):
                continue
            parsed = caption_for(filename)
            if not parsed:
                continue
            caption, identity = parsed
            source_items.setdefault(identity[0], set()).add(identity[1])
            if identity in target_items:
                skipped += 1
                print(f"SKIP existing source={message.id} S{identity[0]:02d}E{identity[1]:02d} {identity[3]}", flush=True)
                continue
            if DRY_RUN:
                print(f"DRY source={message.id} S{identity[0]:02d}E{identity[1]:02d} {identity[3]} {filename}", flush=True)
                continue
            await client.send_file(target, message.media, caption=caption, force_document=True)
            target_items.add(identity)
            copied += 1
            print(f"COPIED source={message.id} S{identity[0]:02d}E{identity[1]:02d} {identity[3]}", flush=True)
            await asyncio.sleep(1.2)
    finally:
        await client.disconnect()

    for season in sorted(source_items):
        episodes = sorted(source_items[season])
        missing = sorted(set(range(1, max(episodes) + 1)) - set(episodes)) if episodes else []
        print(f"SOURCE season={season} episodes={','.join(map(str, episodes))}", flush=True)
        print(f"SOURCE_MISSING season={season} episodes={','.join(map(str, missing)) if missing else 'none'}", flush=True)
    print(f"Completed: copied={copied} skipped={skipped}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

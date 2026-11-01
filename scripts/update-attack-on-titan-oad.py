"""One-time migration for Attack on Titan OAD Telegram captions."""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession

GUIDE = {
    1: ("Ilse's Notebook: Notes from a Scout Regiment Member", "2013-12-09"),
    2: ("The Sudden Visitor: The Torturous Curse of Youth", "2014-04-09"),
    3: ("Distress", "2014-08-08"),
    4: ("No Regrets - Part 1", "2014-12-09"),
    5: ("No Regrets - Part 2", "2015-04-09"),
    6: ("Lost Girls: Wall Sina, Goodbye - Part 1", "2017-12-08"),
    7: ("Lost Girls: Wall Sina, Goodbye - Part 2", "2018-04-09"),
    8: ("Lost Girls: Lost in the Cruel World", "2018-08-09"),
}

def episode_number(name):
    match = re.search(r"(?i)\b(?:EP?|episode)\s*0*(\d{1,2})\b", name)
    return int(match.group(1)) if match else None

def quality(name):
    match = re.search(r"(?i)\b(2160p|1080p|720p|480p|360p|4k)\b", name)
    return "2160p" if match and match.group(1).lower() == "4k" else (match.group(1).upper() if match else "720P")

def slug_map():
    try:
        data = json.loads(Path("data/anime.json").read_text(encoding="utf-8"))
        return {str(ep.get("telegram_message_id")): ep.get("slug_id")
                for show in data.get("anime", [])
                for ep in show.get("episodes", [])
                if ep.get("telegram_message_id") and ep.get("slug_id")}
    except (OSError, ValueError):
        return {}

async def main():
    required = ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION", "TELEGRAM_ANIME_CHANNEL_ID")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise SystemExit("Missing: " + ", ".join(missing))
    dry_run = os.getenv("DRY_RUN", "0") == "1"
    client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"])
    slugs = slug_map()
    changed = 0
    async with client:
        channel = int(os.environ["TELEGRAM_ANIME_CHANNEL_ID"])
        async for message in client.iter_messages(channel):
            name = str(getattr(getattr(message, "file", None), "name", "") or "")
            if "attack" not in name.casefold() or not re.search(r"(?i)\bOAD\b", name):
                continue
            number = episode_number(name)
            if number not in GUIDE:
                continue
            title, released = GUIDE[number]
            slug = slugs.get(str(message.id))
            if not slug:
                print(f"skip #{message.id}: no episode slug", flush=True)
                continue
            caption = "\n".join([
                "Anime: Attack on Titan",
                "Anime Slug ID: attack-on-titan",
                "Collection: OAD",
                f"Episode: {number}",
                f"Episode title: {title}",
                f"Release date: {released}",
                f"Quality: {quality(name)}",
                f"Episode Slug ID: {slug}",
            ])
            print(f"#{message.id}: OAD {number} · {title}", flush=True)
            if not dry_run:
                await message.edit(caption)
            changed += 1
    print(f"updated={changed} dry_run={dry_run}")

if __name__ == "__main__":
    asyncio.run(main())

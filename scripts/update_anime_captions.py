"""One-time cleanup of Naruto Shippuden captions in the anime channel."""
import asyncio
import os
import re
import secrets
import sys

from telethon import TelegramClient
from telethon.sessions import StringSession

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from src.telegram_media import anime_filename_parts, manual_anime_season


def slugify(value):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.casefold()))[:70] or "anime"


def existing_episode_slug(caption):
    match = re.search(r"(?im)^Episode Slug ID:\s*([A-Za-z0-9_-]{8,80})\s*$", caption or "")
    return match.group(1) if match else ""


def build_caption(message, max_episode):
    filename = str(getattr(message.file, "name", "") or "")
    title, explicit_season, episode, part = anime_filename_parts(filename)
    if not episode or episode > max_episode:
        return None
    season = explicit_season or manual_anime_season(title, episode)
    if not season:
        return None
    quality = re.search(r"(?i)\b(2160p|1080p|720p|480p|360p|4k)\b", filename)
    quality = quality.group(1).lower().replace("4k", "2160p") if quality else "auto"
    caption = "\n".join([
        f"Anime: {title}",
        f"Anime Slug ID: {slugify(title)}",
        f"Season: {season}",
        f"Episode: {episode}" + (f" · Part: {part}" if part else ""),
        f"Quality: {quality}",
        f"Episode Slug ID: {existing_episode_slug(getattr(message, 'raw_text', '') or '') or secrets.token_urlsafe(12)}",
    ])
    return caption


async def main():
    required = ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION", "TELEGRAM_ANIME_CHANNEL_ID")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise SystemExit("Missing secrets: " + ", ".join(missing))
    max_episode = int(os.getenv("MAX_EPISODE", "88"))
    dry_run = os.getenv("DRY_RUN", "false").casefold() == "true"
    client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"])
    updated = 0
    async with client:
        async for message in client.iter_messages(int(os.environ["TELEGRAM_ANIME_CHANNEL_ID"]), limit=None):
            if not (message.document or message.video):
                continue
            caption = build_caption(message, max_episode)
            if not caption or caption == (message.raw_text or "").strip():
                continue
            print(f"{'DRY RUN ' if dry_run else ''}update message {message.id}: {caption.splitlines()[0]} · S{caption.splitlines()[2].split(':', 1)[1].strip()}E{caption.splitlines()[3].split(':', 1)[1].split('·')[0].strip()}", flush=True)
            if not dry_run:
                await message.edit(caption)
                await asyncio.sleep(0.4)
            updated += 1
    print(f"Updated captions: {updated}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

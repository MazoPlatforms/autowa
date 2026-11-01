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


def caption_is_canonical(caption):
    """Reject stale release tags from the title and slug fields."""
    lines = [line.strip() for line in str(caption or '').splitlines()]
    anime = next((line.split(':', 1)[1].strip() for line in lines if line.lower().startswith('anime:')), '')
    slug = next((line.split(':', 1)[1].strip() for line in lines if line.lower().startswith('anime slug id:')), '')
    if not anime or slug != slugify(anime):
        return False
    return not re.search(r'(?i)(?:720p|1080p|2160p|4k|multi(?:\s+audio)?|audio|esub|tamil|telugu|malayalam|kannada|hindi|english|tam\+|mal\+|hin\+|eng\+|jap\+)', anime)


async def main():
    required = ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION", "TELEGRAM_ANIME_CHANNEL_ID")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise SystemExit("Missing secrets: " + ", ".join(missing))
    max_episode = int(os.getenv("MAX_EPISODE", "500"))
    dry_run = os.getenv("DRY_RUN", "false").casefold() == "true"
    client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"])
    updated = 0
    verified = 0
    timed_out = []
    async with client:
        channel = int(os.environ["TELEGRAM_ANIME_CHANNEL_ID"])
        async for message in client.iter_messages(channel, limit=None):
            if not (message.document or message.video):
                continue
            caption = build_caption(message, max_episode)
            if not caption:
                continue
            if caption != (message.raw_text or "").strip():
                print(f"{'DRY RUN ' if dry_run else ''}update message {message.id}: {caption.splitlines()[0]} · S{caption.splitlines()[2].split(':', 1)[1].strip()}E{caption.splitlines()[3].split(':', 1)[1].split('·')[0].strip()}", flush=True)
            if not dry_run and caption != (message.raw_text or "").strip():
                try:
                    await asyncio.wait_for(message.edit(caption), timeout=25)
                except asyncio.TimeoutError:
                    timed_out.append(message.id)
                    print(f"timeout editing message {message.id}; continuing", flush=True)
                    continue
                await asyncio.sleep(0.4)
                updated += 1
            if not dry_run:
                try:
                    current = await asyncio.wait_for(client.get_messages(channel, ids=message.id), timeout=25)
                except asyncio.TimeoutError:
                    timed_out.append(message.id)
                    print(f"timeout verifying message {message.id}; continuing", flush=True)
                    continue
                actual = (getattr(current, 'raw_text', '') or '').strip()
                if actual != caption or not caption_is_canonical(actual):
                    raise RuntimeError(f"Caption verification failed for Telegram message {message.id}")
                verified += 1
                print(f"verified message {message.id}: {actual.splitlines()[0]}", flush=True)
    print(f"Updated captions: {updated}; Verified captions: {verified}; Timed out: {len(timed_out)}", flush=True)
    if timed_out:
        raise RuntimeError("Telegram caption cleanup timed out for message(s): " + ", ".join(map(str, timed_out)))


if __name__ == "__main__":
    asyncio.run(main())

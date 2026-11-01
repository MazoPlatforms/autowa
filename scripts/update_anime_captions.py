"""Normalize every anime Telegram caption and assign one stable slug per message."""
import asyncio
import json
import os
import re
import sys
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from src.telegram_media import (
    anime_caption_parts,
    anime_filename_parts,
    anime_special_type,
    fixed_anime_episode_slug,
    manual_anime_season,
)


def slugify(value):
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.casefold()))[:70] or "anime"


def parent_slug_map():
    """Map every quality message to its parent episode slug."""
    try:
        data = json.loads(Path("data/anime.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    result = {}
    for show in data.get("anime", []):
        for episode in show.get("episodes", []):
            parent = str(episode.get("slug_id") or "").strip()
            if not parent:
                continue
            for variant in [episode, *(episode.get("qualities") or {}).values()]:
                if variant.get("telegram_message_id") is not None:
                    result[str(variant["telegram_message_id"])] = parent
    return result


def build_caption(message, episode_slugs):
    filename = str(getattr(message.file, "name", "") or "")
    title, filename_season, episode, part = anime_filename_parts(filename)
    previous = anime_caption_parts(getattr(message, "raw_text", "") or "")
    title = title or previous["title"]
    season = filename_season or previous["season"] or manual_anime_season(title, episode)
    episode = episode or previous["episode"]
    if not episode:
        return None
    special = anime_special_type(filename)
    quality_match = re.search(r"(?i)\b(2160l?p|1080l?p|720l?p|480l?p|360l?p|4k)\b", filename)
    quality = quality_match.group(1).lower().replace("lp", "p").replace("4k", "2160p") if quality_match else (previous["quality"] or "720p")
    season_line = f"Collection: {special}" if special else f"Season: {season or 1}"
    lines = [
        f"Anime: {title}",
        f"Anime Slug ID: {slugify(title)}",
        season_line,
        f"Episode: {episode}" + (f" · Part: {part}" if part else ""),
        f"Quality: {quality}",
        f"Episode Slug ID: {episode_slugs.get(str(message.id), fixed_anime_episode_slug(message.id))}",
    ]
    return "\n".join(lines)


def caption_is_canonical(caption, message_id, episode_slugs):
    lines = [line.strip() for line in str(caption or "").splitlines()]
    anime = next((line.split(":", 1)[1].strip() for line in lines if line.lower().startswith("anime:")), "")
    slug = next((line.split(":", 1)[1].strip() for line in lines if line.lower().startswith("anime slug id:")), "")
    episode_slug = next((line.split(":", 1)[1].strip() for line in lines if line.lower().startswith("episode slug id:")), "")
    expected = episode_slugs.get(str(message_id), fixed_anime_episode_slug(message_id))
    return bool(anime and slug == slugify(anime) and episode_slug == expected)


async def main():
    required = ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION", "TELEGRAM_ANIME_CHANNEL_ID")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise SystemExit("Missing secrets: " + ", ".join(missing))
    dry_run = os.getenv("DRY_RUN", "false").casefold() == "true"
    episode_slugs = parent_slug_map()
    client = TelegramClient(
        StringSession(os.environ["TELEGRAM_SESSION"]),
        int(os.environ["TELEGRAM_API_ID"]),
        os.environ["TELEGRAM_API_HASH"],
    )
    updated = verified = 0
    timed_out = []
    async with client:
        channel = int(os.environ["TELEGRAM_ANIME_CHANNEL_ID"])
        async for message in client.iter_messages(channel, limit=None):
            if not (message.document or message.video):
                continue
            caption = build_caption(message, episode_slugs)
            if not caption:
                print(f"skip message {message.id}: episode number not found", flush=True)
                continue
            current = (message.raw_text or "").strip()
            if caption != current:
                print(f"{'DRY RUN ' if dry_run else ''}update message {message.id}: {caption.splitlines()[0]} · {caption.splitlines()[2]}", flush=True)
            if not dry_run and caption != current:
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
                    current_message = await asyncio.wait_for(client.get_messages(channel, ids=message.id), timeout=25)
                except asyncio.TimeoutError:
                    timed_out.append(message.id)
                    print(f"timeout verifying message {message.id}; continuing", flush=True)
                    continue
                actual = (getattr(current_message, "raw_text", "") or "").strip()
                if actual != caption or not caption_is_canonical(actual, message.id, episode_slugs):
                    raise RuntimeError(f"Caption verification failed for Telegram message {message.id}")
                verified += 1
    print(f"Updated captions: {updated}; Verified captions: {verified}; Timed out: {len(timed_out)}", flush=True)
    if timed_out:
        raise RuntimeError("Telegram caption cleanup timed out for message(s): " + ", ".join(map(str, timed_out)))


if __name__ == "__main__":
    asyncio.run(main())

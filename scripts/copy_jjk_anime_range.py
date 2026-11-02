"""Copy only Jujutsu Kaisen MKV messages into FilmGo's anime channel.

This is intentionally a bounded, one-time migration. It reads the source
channel, skips every non-MKV message, and sends each media item to the target
with the same canonical caption format used by the bot.
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


SOURCE = os.getenv("SOURCE_CHANNEL", "New_Tamill_Movies")
START_ID = int(os.getenv("START_MESSAGE_ID", "328"))
END_ID = int(os.getenv("END_MESSAGE_ID", "548"))
TITLE = "Jujutsu Kaisen"
SLUG = "jujutsu-kaisen"


def caption_for(filename: str):
    title, season, episode, part = anime_filename_parts(filename)
    if title.casefold().replace(" ", "") != TITLE.casefold().replace(" ", ""):
        return None
    if not episode:
        return None
    season = season or 1
    quality_match = re.search(r"(?i)(2160l?p|1080l?p|720l?p|480l?p|360l?p|4k)(?=[^a-z0-9]|$)", filename)
    quality = (quality_match.group(1) if quality_match else "720p").lower().replace("lp", "p")
    special_type = anime_special_type(filename)
    episode_slug = anime_parent_slug(TITLE, season, episode, special_type, part)
    return "\n".join((
        f"Anime: {TITLE}",
        f"Anime Slug ID: {SLUG}",
        f"Season: {season}",
        f"Episode: {episode}",
        f"Quality: {quality}",
        f"Episode Slug ID: {episode_slug}",
    )), {"season": season, "episode": episode, "part": part, "quality": quality, "special_type": special_type}, episode_slug


async def main():
    required = ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION", "TELEGRAM_ANIME_CHANNEL_ID")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing Telegram settings: " + ", ".join(missing))
    if START_ID > END_ID:
        raise ValueError("START_MESSAGE_ID must not be greater than END_MESSAGE_ID")

    target_id = int(os.environ["TELEGRAM_ANIME_CHANNEL_ID"])
    client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"])
    await client.start()
    source = await client.get_entity(SOURCE)
    target = await client.get_entity(target_id)
    copied = skipped = 0
    seen = set()
    source_episodes = {}
    try:
        async for message in client.iter_messages(source, min_id=START_ID - 1, max_id=END_ID + 1, reverse=True):
            if not (START_ID <= message.id <= END_ID) or not message.file:
                skipped += 1
                continue
            filename = str(message.file.name or "")
            if not re.search(r"(?i)\.mkv$", filename):
                skipped += 1
                continue
            parsed = caption_for(filename)
            if not parsed:
                skipped += 1
                continue
            caption, parts, episode_slug = parsed
            quality = parts["quality"].lower()
            identity = (parts["season"] or 1, parts["episode"], quality)
            source_episodes.setdefault(identity[0], set()).add(identity[1])
            if identity in seen:
                skipped += 1
                continue
            # Do not duplicate an already-copied episode/quality if the action
            # is manually re-run.
            already = False
            async for existing in client.iter_messages(target, search=f"Episode: {parts['episode']}", limit=100):
                if existing.raw_text and f"Anime Slug ID: {SLUG}" in existing.raw_text and f"Quality: {quality}" in existing.raw_text and f"Season: {parts['season'] or 1}" in existing.raw_text:
                    already = True
                    break
            if already:
                skipped += 1
                seen.add(identity)
                print(f"SKIP existing source={message.id} episode={identity[1]} quality={quality}", flush=True)
                continue
            await client.send_file(target, message.media, caption=caption, force_document=True)
            copied += 1
            seen.add(identity)
            print(f"COPIED source={message.id} episode={identity[1]} quality={quality} slug={episode_slug}", flush=True)
            await asyncio.sleep(1.2)
    finally:
        await client.disconnect()
    for season in sorted(source_episodes):
        highest = max(source_episodes[season])
        missing = sorted(set(range(1, highest + 1)) - source_episodes[season])
        print(f"SOURCE season={season} episodes={','.join(map(str, sorted(source_episodes[season])))}", flush=True)
        print(f"MISSING season={season} episodes={','.join(map(str, missing)) if missing else 'none'}", flush=True)
    print(f"Completed: copied={copied} skipped={skipped}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

"""Copy selected anime document uploads into FilmGo's anime channel.

Only MKV/MP4 files uploaded as documents are accepted. Telegram video messages,
other media, and non-Solo-Leveling filenames are ignored.
"""
import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.telegram_media import anime_filename_parts, anime_parent_slug, anime_special_type


SOURCE = os.getenv("SOURCE_CHANNEL", "Solo_leveling_tamil_ongoing")
TITLE = os.getenv("COPY_TITLE", "Solo Leveling")
SLUG = os.getenv("COPY_SLUG", "solo-leveling")
DRY_RUN = os.getenv("DRY_RUN", "0") == "1"
REVIEW_ONLY = os.getenv("REVIEW_ONLY", "0") == "1"
ALLOW_VIDEO_SOURCE = os.getenv("ALLOW_VIDEO_SOURCE", "0") == "1"
REPROCESS_SOURCE_IDS = {
    int(value.strip()) for value in os.getenv("REPROCESS_SOURCE_IDS", "").split(",")
    if value.strip().isdigit()
}


def quality_of(filename):
    match = re.search(r"(?i)(2160l?p|2140l?p|1080l?p|720l?p|480l?p|360l?p|4k)(?=[^a-z0-9]|$)", filename)
    return (match.group(1) if match else "720p").lower().replace("lp", "p")


def solo_parts(raw):
    """Parse Solo Leveling even when uploader/release text surrounds Sxx/Eyy."""
    value = re.sub(r"(?i)\.(mkv|mp4)(\.\w+)?$", "", str(raw or ""))
    normalized = re.sub(r"[_._•]+", " ", value)
    marker = re.escape(TITLE).replace(r"\ ", r"\s+")
    if not re.search(rf"(?i)\b{marker}\b", normalized):
        return None
    combined = re.search(r"(?i)\bS\s*0*(\d{1,2})\s*(?:-|x)?\s*E\s*0*(\d{1,3})\b", normalized)
    season_match = re.search(r"(?i)\b(?:season\s*|s\s*[o0]?\s*)0*(\d{1,2})\b", normalized)
    episode_match = re.search(r"(?i)\b(?:episode|ep|e)\s*[:#_\-]?\s*0*(\d{1,3})\b", normalized)
    if combined:
        season, episode = int(combined.group(1)), int(combined.group(2))
        return season, episode
    if not episode_match and season_match:
        episode_match = re.search(r"(?i)^\s*[-–]\s*0*(\d{1,3})\b", normalized[season_match.end():])
    if not episode_match or re.search(r"(?i)\bepisodes\b", normalized):
        return None
    season = int(season_match.group(1)) if season_match else 1
    episode = int(episode_match.group(1))
    return season, episode


def caption_for(filename):
    parsed = solo_parts(filename)
    if not parsed:
        return None
    season, episode = parsed
    special_type = None
    quality = quality_of(filename)
    parent = anime_parent_slug(TITLE, season, episode, special_type, 0)
    caption = "\n".join((
        f"Anime: {TITLE}",
        f"Anime Slug ID: {SLUG}",
        f"Season: {season}",
        f"Episode: {episode}",
        f"Quality: {quality}",
        f"Episode Slug ID: {parent}",
    ))
    return caption, (season, episode, 0, quality)


def review_candidates(message, previous_messages):
    """Return filename/caption candidates, including a standalone poster caption above a file."""
    filename = str(message.file.name or "") if message.file else ""
    candidates = [("filename", filename)] if filename else []
    caption = str(getattr(message, "raw_text", "") or "").strip()
    if caption:
        candidates.append(("file-caption", caption))
    for previous in reversed(previous_messages[-3:]):
        if getattr(previous, "photo", None) and str(getattr(previous, "raw_text", "") or "").strip():
            candidates.append(("image-caption-above", str(previous.raw_text).strip()))
            break
    return candidates


def caption_identity(text):
    text = str(text or "")
    if not re.search(rf"(?im)^\s*Anime Slug ID\s*:\s*{re.escape(SLUG)}\s*$", text):
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
    target_messages = {}
    copied = skipped = 0
    try:
        async for message in client.iter_messages(target, limit=None):
            identity = caption_identity(getattr(message, "raw_text", ""))
            if identity:
                target_items.add(identity)
                target_messages.setdefault(identity, message.id)

        previous_messages = []
        async for message in client.iter_messages(source, reverse=True):
            # Source videos may be recovered, but they are always downloaded and
            # re-uploaded as documents to the target channel.
            if not message.file or (message.video and not ALLOW_VIDEO_SOURCE):
                previous_messages.append(message)
                continue
            filename = str(message.file.name or "")
            if message.video and not filename and str(message.file.mime_type or "").lower() == "video/mp4":
                filename = "Solo Leveling 720p.mp4"
            if not re.search(r"(?i)\.(mkv|mp4)$", filename):
                previous_messages.append(message)
                continue
            candidates = review_candidates(message, previous_messages)
            parsed = next((caption_for(value) for _, value in candidates if caption_for(value)), None)
            if REVIEW_ONLY:
                label = " | ".join(f"{kind}={value.replace(chr(10), ' / ')[:180]}" for kind, value in candidates)
                parsed_label = "unparsed"
                if parsed:
                    parsed_label = f"S{parsed[1][0]:02d}E{parsed[1][1]:02d} {parsed[1][3]}"
                print(f"REVIEW source={message.id} {label} => {parsed_label}", flush=True)
                previous_messages.append(message)
                continue
            if not parsed:
                previous_messages.append(message)
                continue
            caption, identity = parsed
            source_items.setdefault(identity[0], set()).add(identity[1])
            forced = message.id in REPROCESS_SOURCE_IDS
            if identity in target_items and not forced:
                skipped += 1
                print(f"SKIP existing source={message.id} S{identity[0]:02d}E{identity[1]:02d} {identity[3]}", flush=True)
                continue
            if DRY_RUN:
                print(f"DRY source={message.id} S{identity[0]:02d}E{identity[1]:02d} {identity[3]} {filename}", flush=True)
                continue
            if message.video:
                with tempfile.TemporaryDirectory(prefix="solo-leveling-") as temp:
                    downloaded = await client.download_media(message, file=temp)
                    if not downloaded:
                        print(f"SKIP download-failed source={message.id}", flush=True)
                        previous_messages.append(message)
                        continue
                    await client.send_file(target, downloaded, caption=caption, force_document=True)
            else:
                await client.send_file(target, message.media, caption=caption, force_document=True)
            if forced and identity in target_messages:
                try:
                    await client.delete_messages(target, [target_messages[identity]])
                    print(f"DELETED old target={target_messages[identity]} for S{identity[0]:02d}E{identity[1]:02d} {identity[3]}", flush=True)
                except Exception as error:
                    print(f"WARN old-target-delete-failed identity={identity} error={error}", flush=True)
            target_items.add(identity)
            copied += 1
            print(f"COPIED source={message.id} S{identity[0]:02d}E{identity[1]:02d} {identity[3]}", flush=True)
            await asyncio.sleep(1.2)
            previous_messages.append(message)
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

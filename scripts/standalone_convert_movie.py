"""One-shot Telegram MKV -> MP4 migration utility.

This file is deliberately standalone: it only reads data/movies.json and the
source Telegram message. It never edits the catalog, movies/, captions, or
existing application files.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession

SOURCE_CHANNEL = int(os.environ.get("TELEGRAM_CHANNEL_ID", "0"))
VIDEO_CHANNEL = -1004486727011
DOCUMENT_CHANNEL = -1003784306123
ARCHIVE_CHANNEL = -1003821706724
LOG_CHAT = -1003590056946


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment secret: {name}")
    return value


class BotLog:
    def __init__(self, token: str):
        self.base = f"https://api.telegram.org/bot{token}/"
        self.thread_id: int | None = None
        self.message_id: int | None = None

    def call(self, method: str, payload: dict) -> dict:
        body = json.dumps(payload).encode()
        request = urllib.request.Request(
            self.base + method,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode())
        if not result.get("ok"):
            raise RuntimeError(f"Telegram Bot API {method} failed: {result.get('description')}")
        return result["result"]

    def start(self, name: str) -> None:
        topic = self.call("createForumTopic", {"chat_id": LOG_CHAT, "name": name})
        self.thread_id = int(topic["message_thread_id"])
        sent = self.call("sendMessage", {
            "chat_id": LOG_CHAT,
            "message_thread_id": self.thread_id,
            "text": "Standalone converter started.",
        })
        self.message_id = int(sent["message_id"])

    def update(self, text: str) -> None:
        if self.message_id is None or self.thread_id is None:
            return
        try:
            self.call("editMessageText", {
                "chat_id": LOG_CHAT,
                "message_id": self.message_id,
                "text": text[:4096],
            })
        except Exception as error:
            print(f"Log update failed: {error}", flush=True)


def run(command: list[str], *, cwd: Path | None = None) -> None:
    print("$", " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-show_chapters", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    return json.loads(result.stdout)


def safe_name(value: str) -> str:
    return re.sub(r"[\r\n\\/\"<>:*?|]+", "_", value).strip()[:180] or "artifact"


def whatsapp_filename(movie: dict) -> str:
    title = str(movie.get("title") or "Untitled").strip()
    year = str(movie.get("year") or "")
    quality = str(movie.get("quality") or "Unknown Quality")
    return safe_name(f"FilmGo - {title}{f' ({year})' if year else ''} - {quality}.mp4")


def download_bot_thumbnail(token: str, destination: Path) -> Path | None:
    try:
        me = BotLog(token).call("getMe", {})
        photos = BotLog(token).call("getUserProfilePhotos", {"user_id": me["id"], "limit": 1})
        if not photos.get("photos"):
            return None
        file_id = photos["photos"][0][-1]["file_id"]
        info = BotLog(token).call("getFile", {"file_id": file_id})
        url = f"https://api.telegram.org/file/bot{token}/{info['file_path']}"
        with urllib.request.urlopen(url, timeout=20) as response:
            destination.write_bytes(response.read())
        return destination
    except Exception as error:
        print(f"Bot profile thumbnail unavailable: {error}", flush=True)
        return None


def extract_everything(source: Path, directory: Path, metadata: dict) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    artifacts: list[Path] = []
    metadata_path = directory / "streams-and-container-metadata.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    artifacts.append(metadata_path)

    for index, stream in enumerate(metadata.get("streams", [])):
        codec_type = stream.get("codec_type")
        codec_name = str(stream.get("codec_name") or "bin")
        language = safe_name(str((stream.get("tags") or {}).get("language") or f"track-{index + 1}"))
        if codec_type == "audio":
            output = directory / f"audio-{index + 1}-{language}.{codec_name}.mka"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", f"0:{index}", "-c", "copy", str(output)])
            artifacts.append(output)
        elif codec_type == "subtitle":
            ext = "ass" if codec_name in {"ass", "ssa"} else "srt" if codec_name in {"subrip", "srt"} else codec_name
            output = directory / f"subtitle-{index + 1}-{language}.{ext}"
            run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", f"0:{index}", "-c", "copy", str(output)])
            artifacts.append(output)

    attachment_dir = directory / "attachments"
    attachment_dir.mkdir()
    attachment_result = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-dump_attachment:t", "", "-i", str(source)],
        cwd=attachment_dir,
    )
    if attachment_result.returncode != 0:
        print("No extractable Matroska attachments (continuing).", flush=True)
    artifacts.extend(sorted(p for p in attachment_dir.iterdir() if p.is_file()))
    return artifacts


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--movie-index", type=int, default=0)
    args = parser.parse_args()
    if args.movie_index < 0:
        raise ValueError("movie index must be non-negative")

    api_id = int(required("TELEGRAM_API_ID"))
    api_hash = required("TELEGRAM_API_HASH")
    session = required("TELEGRAM_SESSION")
    bot_token = required("BOT_TOKEN")
    catalog = json.loads(Path("data/movies.json").read_text())
    movies = catalog.get("movies", [])
    movie = movies[args.movie_index]
    message_id = int(movie["telegram_message_id"])
    title = str(movie.get("title") or "Movie")
    quality = str(movie.get("quality") or "unknown")
    log = BotLog(bot_token)
    work = Path(tempfile.mkdtemp(prefix="filmgo-standalone-"))
    source = work / "source.download"
    converted = work / whatsapp_filename(movie)
    thumb = work / "bot-profile.jpg"

    try:
        log.start(f"Standalone conversion · {title} · #{message_id}")
        log.update(f"Working on: {title} ({movie.get('year', '—')}) · source message ID {message_id}\nDownloading…")
        client = TelegramClient(StringSession(session), api_id, api_hash, receive_updates=False)
        await client.connect()
        try:
            source_entity = await client.get_entity(SOURCE_CHANNEL)
            message = await client.get_messages(source_entity, ids=message_id)
            if not message or not message.file:
                raise RuntimeError(f"Source message {message_id} has no document")
            current_caption = message.message or ""
            total = int(getattr(message.file, "size", 0) or 0)
            last_log = [0.0]
            def download_progress(done: int, size: int) -> None:
                now = time.monotonic()
                if now - last_log[0] >= 5 or done == size:
                    pct = done * 100 / size if size else 0
                    log.update(f"Working on: {title}\nDownloading: {pct:.1f}% ({done}/{size} bytes)")
                    last_log[0] = now
            await client.download_media(message, file=str(source), progress_callback=download_progress)
        finally:
            await client.disconnect()

        metadata = probe(source)
        log.update(f"Working on: {title}\nDownload complete. Extracting audio, subtitles, chapters, menus and metadata…")
        artifacts = extract_everything(source, work / "artifacts", metadata)

        log.update(f"Working on: {title}\nConverting to MP4…")
        # All video/audio streams are mapped; subtitles are converted where MP4 supports them.
        run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", "0:v:0", "-map", "0:a?", "-map", "0:s?", "-map_metadata", "0", "-map_chapters", "0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-c:s", "mov_text", "-movflags", "+faststart", str(converted)])
        thumb_path = download_bot_thumbnail(bot_token, thumb)
        video_caption = (current_caption + f"\n\nOriginal telegram_message_id: {message_id}").strip()
        document_caption = current_caption.strip()
        log.update(f"Working on: {title}\nUploading converted video to {VIDEO_CHANNEL}…")
        client = TelegramClient(StringSession(session), api_id, api_hash, receive_updates=False)
        await client.connect()
        try:
            video_entity = await client.get_entity(VIDEO_CHANNEL)
            document_entity = await client.get_entity(DOCUMENT_CHANNEL)
            archive_entity = await client.get_entity(ARCHIVE_CHANNEL)
            upload_progress_state = [0.0]
            def upload_progress(done: int, size: int) -> None:
                now = time.monotonic()
                if now - upload_progress_state[0] >= 5 or done == size:
                    pct = done * 100 / size if size else 0
                    log.update(f"Working on: {title}\nUploading: {pct:.1f}% ({done}/{size} bytes)")
                    upload_progress_state[0] = now
            await client.send_file(video_entity, str(converted), caption=video_caption, thumb=str(thumb_path) if thumb_path else None, supports_streaming=True, progress_callback=upload_progress)
            log.update(f"Working on: {title}\nVideo uploaded. Uploading renamed document…")
            await client.send_file(document_entity, str(converted), caption=document_caption, thumb=str(thumb_path) if thumb_path else None, force_document=True, progress_callback=upload_progress)
            for artifact in artifacts:
                log.update(f"Working on: {title}\nStoring artifact: {artifact.name}")
                await client.send_file(archive_entity, str(artifact), caption=f"{title} · original telegram_message_id: {message_id}\nArtifact: {artifact.name}", force_document=True, progress_callback=upload_progress)
        finally:
            await client.disconnect()
        log.update(f"Completed: {title}\nVideo, renamed document, and {len(artifacts)} extracted artifacts uploaded successfully.")
    except Exception as error:
        log.update(f"FAILED: {title}\n{type(error).__name__}: {error}")
        raise
    finally:
        shutil.rmtree(work, ignore_errors=True)
        print(f"Cleaned temporary workspace: {work}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

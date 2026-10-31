"""Standalone demo: extract every media sidecar from one Telegram movie.

The source video is downloaded only to the temporary GitHub Actions runner.
The original Telegram message and the repository catalog are never edited.
"""
import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from telethon import TelegramClient
from telethon.sessions import StringSession

DEFAULT_SOURCE = os.environ.get("TELEGRAM_SOURCE_CHANNEL_ID") or os.environ.get("TELEGRAM_CHANNEL_ID")
DEFAULT_TARGET = os.environ.get("TELEGRAM_EXTRACTION_CHANNEL_ID", "-1003821706724")
CATALOG = Path("data/movies.json")


def run(command, *, capture=False):
    return subprocess.run(command, check=True, text=True, capture_output=capture)


def safe(value, fallback):
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "")).strip("._")
    return value[:100] or fallback


def probe(path):
    result = run([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-show_chapters",
        "-of", "json", str(path),
    ], capture=True)
    return json.loads(result.stdout)


def stream_label(stream, index):
    tags = stream.get("tags") or {}
    return safe(tags.get("title") or tags.get("language") or stream.get("codec_name"), f"track-{index + 1:02d}")


def extract_audio(source, stream_index, stream, output_dir, stem):
    label = stream_label(stream, stream_index)
    original = output_dir / f"{stem}.audio-{stream_index + 1:02d}-{label}.mka"
    compatible = output_dir / f"{stem}.audio-{stream_index + 1:02d}-{label}.aac.m4a"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", f"0:a:{stream_index}", "-map_metadata", "0", "-c:a", "copy", str(original)])
    # AAC stereo is broadly playable in Android WebView and desktop browsers.
    run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", f"0:a:{stream_index}", "-vn", "-map_metadata", "0", "-c:a", "aac", "-b:a", "192k", "-ac", "2", str(compatible)])
    return [original, compatible]


def extract_subtitle(source, stream_index, stream, output_dir, stem):
    label = stream_label(stream, stream_index)
    original = output_dir / f"{stem}.subtitle-{stream_index + 1:02d}-{label}.mks"
    files = []
    try:
        run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", f"0:s:{stream_index}", "-c:s", "copy", str(original)])
        files.append(original)
    except subprocess.CalledProcessError:
        # Keep processing the remaining tracks if a bitmap subtitle cannot be
        # written as a standalone Matroska subtitle stream.
        pass
    codec = str(stream.get("codec_name") or "").lower()
    text_codecs = {"subrip", "srt", "ass", "ssa", "webvtt", "mov_text"}
    if codec in text_codecs:
        compatible = output_dir / f"{stem}.subtitle-{stream_index + 1:02d}-{label}.vtt"
        try:
            run(["ffmpeg", "-y", "-v", "error", "-i", str(source), "-map", f"0:s:{stream_index}", "-c:s", "webvtt", str(compatible)])
            files.append(compatible)
        except subprocess.CalledProcessError:
            pass
    return files


def extract_attachments(source, streams, output_dir, stem):
    files = []
    for index, stream in enumerate(streams):
        tags = stream.get("tags") or {}
        name = safe(tags.get("filename"), f"attachment-{index + 1:02d}")
        target = output_dir / f"{stem}.attachment-{index + 1:02d}-{name}"
        try:
            run(["ffmpeg", "-y", "-v", "error", "-dump_attachment:t", str(target), "-i", str(source), "-map", f"0:t:{index}", "-c", "copy", "-f", "null", "-"])
            if target.exists() and target.stat().st_size:
                files.append(target)
        except subprocess.CalledProcessError:
            pass
    return files


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", default="mlefhQyyZHyAosi3")
    parser.add_argument("--target-channel", default=DEFAULT_TARGET)
    args = parser.parse_args()
    if not DEFAULT_SOURCE:
        raise RuntimeError("TELEGRAM_SOURCE_CHANNEL_ID or TELEGRAM_CHANNEL_ID is required")
    if not os.environ.get("TELEGRAM_API_ID") or not os.environ.get("TELEGRAM_API_HASH") or not os.environ.get("TELEGRAM_SESSION"):
        raise RuntimeError("TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION are required")

    catalog = json.loads(CATALOG.read_text())
    movies = catalog.get("movies", catalog) if isinstance(catalog, dict) else catalog
    movie = next((item for item in movies if item.get("slug_id") == args.slug), None)
    if not movie:
        raise RuntimeError(f"Movie slug not found: {args.slug}")
    variant = movie.get("qualities", {}).get(movie.get("quality"), movie)
    message_id = int(variant["telegram_message_id"])
    stem = safe(f"{movie.get('title', 'movie')}-{movie.get('year', '')}", "movie")
    target = int(args.target_channel)

    with tempfile.TemporaryDirectory(prefix="filmgo-track-extract-") as temp:
        root = Path(temp)
        source_path = root / safe(variant.get("file_name"), "source.mkv")
        output_dir = root / "extractions"
        output_dir.mkdir()
        async with TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"], receive_updates=False) as client:
            source = await client.get_messages(int(DEFAULT_SOURCE), ids=message_id)
            if not source or not source.file:
                raise RuntimeError(f"Telegram message {message_id} has no downloadable media")
            print(f"Downloading source message {message_id}: {stem}", flush=True)
            await client.download_media(source, file=str(source_path))
            metadata = probe(source_path)
            (output_dir / f"{stem}.manifest.json").write_text(json.dumps(metadata, indent=2) + "\n")
            files = [output_dir / f"{stem}.manifest.json"]
            audio = [s for s in metadata.get("streams", []) if s.get("codec_type") == "audio"]
            subtitles = [s for s in metadata.get("streams", []) if s.get("codec_type") == "subtitle"]
            attachments = [s for s in metadata.get("streams", []) if s.get("codec_type") == "attachment"]
            for index, stream in enumerate(audio):
                files.extend(extract_audio(source_path, index, stream, output_dir, stem))
            for index, stream in enumerate(subtitles):
                files.extend(extract_subtitle(source_path, index, stream, output_dir, stem))
            files.extend(extract_attachments(source_path, attachments, output_dir, stem))
            chapters = output_dir / f"{stem}.chapters.ffmetadata"
            try:
                run(["ffmpeg", "-y", "-v", "error", "-i", str(source_path), "-f", "ffmetadata", str(chapters)])
                files.append(chapters)
            except subprocess.CalledProcessError:
                pass
            print(f"Extracted {len(files)} sidecar files; uploading to {target}", flush=True)
            notice = await client.send_message(target, f"🎬 Track extraction demo\n{movie.get('title')} ({movie.get('year')})\nSource message: {message_id}\nFiles: {len(files)}")
            for path in files:
                if not path.exists() or path.stat().st_size == 0:
                    continue
                caption = f"FilmGo extraction demo · {movie.get('title')} ({movie.get('year')}) · source #{message_id} · {path.name}"
                await client.send_file(target, str(path), caption=caption, force_document=True)
            await notice.edit(f"✅ Track extraction complete\n{movie.get('title')} ({movie.get('year')})\nSource message: {message_id}\nUploaded files: {len(files)}")


if __name__ == "__main__":
    asyncio.run(main())

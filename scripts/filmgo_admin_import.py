"""Admin-approved GitHub Actions import: HTTPS/Drive -> Telegram channel.
Requires TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION and TELEGRAM_CHANNEL_ID.
The bot only requests the import; large media is transferred by this isolated runner.
"""
import asyncio
import ipaddress
import json
import os
import pathlib
import re
import socket
import sys
import tempfile
import urllib.parse
import urllib.request

from telethon import TelegramClient
from telethon.sessions import StringSession

MAX_BYTES = 2_000_000_000
ALLOWED_EXT = {".mkv", ".mp4", ".avi", ".mov", ".webm", ".m4v"}
def validate_url(raw):
    url = urllib.parse.urlsplit(raw)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.port:
        raise ValueError("Only public HTTPS URLs are accepted")
    host = url.hostname.lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"} or host.endswith((".local", ".internal")):
        raise ValueError("Private hosts are blocked")
    for result in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM):
        ip = ipaddress.ip_address(result[4][0])
        if not ip.is_global:
            raise ValueError("Private or non-public network destination blocked")
    return raw

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def download(url, destination):
    opener = urllib.request.build_opener(SafeRedirect)
    validate_url(url)
    req = urllib.request.Request(url, headers={"User-Agent": "FilmGo-Admin-Importer/1.0"})
    with opener.open(req, timeout=60) as response:
        size = response.headers.get("Content-Length")
        if size and int(size) > MAX_BYTES:
            raise ValueError("Remote file exceeds 2 GB")
        disposition = response.headers.get("Content-Disposition", "")
        match = re.search(r'filename="?([^";]+)', disposition, re.I)
        filename = urllib.parse.unquote(match.group(1)) if match else pathlib.PurePosixPath(urllib.parse.urlsplit(response.url).path).name
        filename = pathlib.PurePosixPath(filename.replace("\\", "/")).name[:180]
        if pathlib.Path(filename).suffix.lower() not in ALLOWED_EXT:
            raise ValueError("Only video media files are allowed; received " + repr(filename))
        total = 0
        with open(destination, "wb") as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                total += len(chunk)
                if total > MAX_BYTES: raise ValueError("Downloaded data exceeds 2 GB")
                out.write(chunk)
    if total == 0: raise ValueError("Empty download")
    return filename, total

def google_drive(url, destination):
    import gdown
    validate_url(url)
    match = re.search(r"/file/d/([\w-]+)", url)
    query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    file_id = match.group(1) if match else (query.get("id") or [None])[0]
    if not file_id or not re.fullmatch(r"[\w-]{10,128}", file_id):
        raise ValueError("Unsupported Google Drive file URL")
    # gdown handles Drive's large-file confirmation page.
    # Let gdown preserve the real Drive filename (including year and quality).
    result = gdown.download(id=file_id, output=str(destination.parent) + os.sep, quiet=False, fuzzy=False)
    if not result: raise ValueError("Google Drive download failed (permissions, quota or confirmation)")
    downloaded = pathlib.Path(result)
    if not downloaded.is_file(): raise ValueError("Google Drive did not return a file")
    size = downloaded.stat().st_size
    if not 0 < size <= MAX_BYTES: raise ValueError("Google Drive file exceeds 2 GB or is empty")
    filename = downloaded.name[:180]
    if pathlib.Path(filename).suffix.lower() not in ALLOWED_EXT: raise ValueError("Unsupported media extension")
    downloaded.replace(destination)
    return filename, size

async def main():
    payload = json.loads(os.environ["FILMGO_IMPORT_JSON"])
    url = validate_url(payload["source_url"])
    if str(payload.get("admin_id")) != os.environ.get("FILMGO_BOT_ADMIN_ID", "7744742903"):
        raise ValueError("Admin identity mismatch")
    with tempfile.TemporaryDirectory(prefix="filmgo-import-") as tmp:
        path = pathlib.Path(tmp) / "media.bin"
        host = urllib.parse.urlsplit(url).hostname.lower()
        if host in ("drive.google.com", "docs.google.com"):
            filename, size = google_drive(url, path)
        else:
            filename, size = download(url, path)
        filename = pathlib.PurePosixPath(filename.replace("\\\\", "/")).name
        upload_path = path.with_name(filename)
        path.replace(upload_path)
        print("Media downloaded:", filename, size, "bytes", flush=True)
        title = re.sub(r"(?i)\.(mkv|mp4|avi|mov|webm|m4v)$", "", filename)
        title = re.sub(r"[._]+", " ", title)
        title = re.split(r"(?i)\b(?:2160p|1080p|720p|480p|4k|web[- ]?dl|webrip|bluray|x264|x265)\b", title, maxsplit=1)[0]
        title = re.sub(r"\s*[\[(]?(?:19\d{2}|20\d{2})[\])]?", " ", title).strip(" -[]()")[:140] or "Untitled movie"
        year_match = re.search(r"\b(19\d{2}|20\d{2})\b", filename)
        quality_match = re.search(r"\b(2160p|1080p|720p|480p|4k)\b", filename, re.I)
        year = year_match.group(1) if year_match else None
        quality = quality_match.group(1).upper() if quality_match else None
        caption = "Movie: " + title + ("\nYear: " + year if year else "") + ("\nQuality: " + quality if quality else "")
        client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"])
        await client.connect()
        try:
            if not await client.is_user_authorized(): raise ValueError("Telegram uploader session unauthorized")
            await client.send_file(int(os.environ["TELEGRAM_CHANNEL_ID"]), str(upload_path), caption=caption, attributes=None, force_document=True, file_size=size)
            print("Uploaded to Telegram channel", flush=True)
        finally:
            await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

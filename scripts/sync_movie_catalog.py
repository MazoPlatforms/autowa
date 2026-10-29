"""Incrementally publish a rights-cleared movie metadata catalog from Telegram captions."""
import asyncio
import difflib
import json
import os
import pathlib
import re
import secrets
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from telethon import TelegramClient
from telethon.sessions import StringSession

PATH = pathlib.Path("data/movies.json")
def omdb(title, year):
    key = os.environ.get("OMDB_API_KEY", "")
    if not key:
        return {}
    params = urllib.parse.urlencode({"apikey": key, "t": title, "y": str(year), "plot": "short"})
    try:
        with urllib.request.urlopen("https://www.omdbapi.com/?" + params, timeout=12) as response:
            data = json.load(response)
        if data.get("Response") != "True":
            return {}
        score = difflib.SequenceMatcher(None, title.casefold(), str(data.get("Title", "")).casefold()).ratio()
        if score < 0.85 or str(data.get("Year", ""))[:4] != str(year):
            return {}
        return {
            "imdb_id": data.get("imdbID"),
            "poster": data.get("Poster") if str(data.get("Poster", "")).startswith("https://") else None,
            "genre": [x.strip() for x in data.get("Genre", "").split(",") if x.strip()],
            "runtime": data.get("Runtime") if data.get("Runtime") != "N/A" else None,
            "director": data.get("Director") if data.get("Director") != "N/A" else None,
            "cast": [x.strip() for x in data.get("Actors", "").split(",") if x.strip()],
            "plot": data.get("Plot") if data.get("Plot") != "N/A" else None,
            "imdb_rating": data.get("imdbRating") if data.get("imdbRating") != "N/A" else None,
            "metadata_status": "matched",
        }
    except Exception as exc:
        print("OMDb lookup unavailable for", title, type(exc).__name__)
        return {}

def parse(message):
    if not message.file or not (message.video or message.document):
        return None
    fields = {}
    for line in (message.message or "").splitlines():
        match = re.match(r"^\s*(Movie|Year|Quality)\s*:\s*(.*?)\s*$", line, re.I)
        if match:
            fields[match.group(1).lower()] = match.group(2).strip()
    filename = str(getattr(message.file, "name", "") or "")
    if not fields.get("movie") and filename:
        value = re.sub(r"(?i)\.(mkv|mp4|avi|mov|webm|m4v)$", "", filename)
        value = re.sub(r"[._]+", " ", value)
        value = re.split(r"(?i)\b(?:2160p|1080p|720p|480p|4k|web[- ]?dl|bluray|webrip|x264|x265)\b", value, maxsplit=1)[0]
        fields["movie"] = re.sub(r"\\s*[\\[(]?(?:19\\d{2}|20\\d{2})[\\])]?", " ", value).strip(" -[]()")[:140]
    if not fields.get("year"):
        match = re.search(r"(?<!\d)(19\d{2}|20\d{2})(?!\d)", filename)
        if match: fields["year"] = match.group(1)
    if not fields.get("quality"):
        match = re.search(r"(?i)\b(2160p|1080p|720p|480p|4k)\b", filename)
        if match: fields["quality"] = match.group(1).upper()
    if not all(fields.get(k) for k in ("movie", "year", "quality")):
        return None
    if not re.fullmatch(r"(19|20)\d{2}", fields["year"]):
        return None
    return {
        "id": "telegram-" + str(message.id),
        "telegram_message_id": message.id,
        "title": fields["movie"][:140],
        "year": int(fields["year"]),
        "quality": fields["quality"][:40],
        "file_size": int(getattr(message.file, "size", 0) or 0),
        "file_name": (getattr(message.file, "name", None) or "")[:255],
        "mime_type": (getattr(message.file, "mime_type", None) or "")[:100],
    }

async def main():
    previous = json.loads(PATH.read_text()) if PATH.exists() else {"movies": []}
    old = {m["id"]: m for m in previous.get("movies", [])}
    api_id = int(os.environ["TELEGRAM_API_ID"])
    client = TelegramClient(StringSession(os.environ["TELEGRAM_SESSION"]), api_id, os.environ["TELEGRAM_API_HASH"], receive_updates=False)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise RuntimeError("Telegram session is unauthorized")
        channel = int(os.environ["TELEGRAM_CHANNEL_ID"])
        dialogs = await client.get_dialogs(limit=100)
        target = abs(channel)
        channel_id = int(str(target)[3:]) if str(target).startswith("100") else target
        entity = next((d.entity for d in dialogs if d.id == channel or getattr(d.entity, "id", None) == channel_id), None)
        if entity is None:
            entity = await client.get_entity(channel)
        current = []
        async for message in client.iter_messages(entity, limit=None):
            item = parse(message)
            if not item:
                continue
            prior = old.get(item["id"], {})
            item["slug_id"] = prior.get("slug_id") or secrets.token_urlsafe(12)
            if all(prior.get(k) == item[k] for k in ("title", "year", "quality", "file_size")):
                for key in ("imdb_id", "poster", "genre", "runtime", "director", "cast", "plot", "imdb_rating", "metadata_status"):
                    if key in prior:
                        item[key] = prior[key]
            else:
                item.update(omdb(item["title"], item["year"]))
            item.setdefault("metadata_status", "unmatched")
            current.append(item)
        if not current and old:
            raise RuntimeError("Refusing to replace a nonempty catalog with an empty Telegram scan")
        current.sort(key=lambda m: m["telegram_message_id"], reverse=True)
        changed = current != previous.get("movies", [])
        if changed:
            PATH.parent.mkdir(parents=True, exist_ok=True)
            PATH.write_text(json.dumps({"schema_version": 1, "updated_at": datetime.now(timezone.utc).isoformat(), "movies": current}, ensure_ascii=False, indent=2) + "\n")
            print("Catalog updated:", len(current))
        else:
            print("No catalog changes")

        # Only write captions after the catalog has successfully persisted its
        # stable slug IDs. Reruns also repair captions left behind by failed edits.
        # Never modify the movie file, its filename, or the catalog slug.
        by_message_id = {item["telegram_message_id"]: item for item in current}
        edited = 0
        failures = 0
        async for message in client.iter_messages(entity, limit=None):
            item = by_message_id.get(message.id)
            if not item or not message.file:
                continue
            caption = "\n".join((
                "Movie: " + item["title"],
                "Year: " + str(item["year"]),
                "Quality: " + item["quality"],
                "Slug ID: " + item["slug_id"],
            ))
            if (message.message or "").strip() == caption:
                continue
            try:
                await client.edit_message(entity, message.id, caption)
                edited += 1
                print("Caption updated for message", message.id)
            except Exception as exc:
                failures += 1
                print("Caption edit failed for message", message.id, type(exc).__name__, str(exc)[:160])
        print("Caption synchronization:", edited, "updated;", failures, "failed")
        if failures:
            print("Some existing captions could not be edited; future scheduled or event-triggered syncs will retry.")

    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())

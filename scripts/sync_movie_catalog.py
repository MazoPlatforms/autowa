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
FALLBACK_POSTER = "https://i.ibb.co/TMJ6YCC4/IMG-33a2f581-8ff4-4a5e-9e64-e43c900000c2.png"

def wikipedia_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "FilmGoCatalogSync/1.0 (+https://github.com/MazoPlatforms/autowa)"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)

def poster_is_valid(url):
    """Verify that a remote poster is reachable and returns image bytes."""
    if not str(url).startswith("https://"):
        return bool(re.fullmatch(r"/posters/[a-f0-9]{24}\.jpg", str(url)))
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "FilmGoCatalogSync/1.0 (+https://github.com/MazoPlatforms/autowa)"})
        with urllib.request.urlopen(request, timeout=15) as response:
            content_type = response.headers.get_content_type()
            return response.status == 200 and content_type.startswith("image/") and bool(response.read(1))
    except Exception:
        return False

def imdb_poster(imdb_id):
    """Return the current IMDb poster for an IMDb title ID, when available."""
    if not re.fullmatch(r"tt\d+", str(imdb_id or "")):
        return None
    try:
        data = wikipedia_json("https://v3.sg.media-imdb.com/suggestion/x/" + urllib.parse.quote(str(imdb_id)) + ".json")
        item = next((entry for entry in data.get("d", []) if entry.get("id") == imdb_id), None)
        source = item.get("i", {}).get("imageUrl", "") if item else ""
        return source if poster_is_valid(source) else None
    except Exception:
        return None

def normalize_title(value):
    """Normalize a title for safe comparison, while preserving its words."""
    value = re.sub(r"\([^)]*\)", " ", str(value or ""))
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()

def is_candidate_film(candidate_title, summary, requested_title, year):
    """Reject unrelated search hits such as actor/director biography pages."""
    wanted = normalize_title(requested_title)
    candidate = normalize_title(candidate_title)
    if not wanted or (wanted not in candidate and candidate not in wanted):
        return False

    description = str(summary.get("description", "")).casefold()
    extract = str(summary.get("extract", ""))
    if "film" not in description and "movie" not in description:
        return False

    year_match = re.search(r"\b(19|20)\d{2}\b", extract)
    return bool(year_match and int(year_match.group(0)) == int(year))

def wikipedia_poster(title, year):
    """Return an image only from a title-matching Wikipedia film page."""
    params = urllib.parse.urlencode({
        "action": "query", "list": "search", "srsearch": f'intitle:"{title}" {year} film',
        "srlimit": 10, "format": "json",
    })
    try:
        results = wikipedia_json("https://en.wikipedia.org/w/api.php?" + params).get("query", {}).get("search", [])
        for candidate in results:
            candidate_title = str(candidate.get("title", "")).strip()
            if not candidate_title:
                continue
            page = urllib.parse.quote(candidate_title.replace(" ", "_"), safe="()")
            try:
                summary = wikipedia_json("https://en.wikipedia.org/api/rest_v1/page/summary/" + page)
            except Exception:
                continue
            if not is_candidate_film(candidate_title, summary, title, year):
                continue
            image = summary.get("originalimage") or summary.get("thumbnail") or {}
            source = image.get("source", "") if isinstance(image, dict) else ""
            if source.startswith("https://"):
                print("Wikipedia poster found for", title, "(" + str(year) + "):", summary.get("title", candidate.get("title")))
                return source
    except Exception as exc:
        print("Wikipedia poster lookup unavailable for", title, type(exc).__name__)
    return None

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
        match = re.match(r"^\s*(Movie|Year|Quality|Slug ID|imdb_id|poster|genre|runtime|director|cast|plot)\s*:\s*(.*?)\s*$", line, re.I)
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
    extra = {k: fields[k] for k in ("imdb_id", "poster", "genre", "runtime", "director", "cast", "plot") if fields.get(k)}
    for k in ("genre", "cast"):
        if k in extra: extra[k] = [v.strip() for v in extra[k].split(",") if v.strip()]
    return {
        **extra,
        "caption_slug": fields.get("slug id"),
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
    old_movies = previous.get("movies", [])
    old = {}
    old_groups = {}
    def identity(title, year):
        return (re.sub(r"[^a-z0-9]+", "", str(title).casefold()), int(year))
    for movie in old_movies:
        key = identity(movie["title"], movie["year"])
        old_groups.setdefault(key, movie)
        for quality, variant in movie.get("qualities", {}).items():
            old["telegram-" + str(variant["telegram_message_id"])] = {**movie, **variant, "quality": quality}
        if movie.get("telegram_message_id"):
            old.setdefault("telegram-" + str(movie["telegram_message_id"]), movie)
    slug_by_identity = {identity(m["title"], m["year"]): m["slug_id"] for m in old_movies if m.get("slug_id")}
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
        groups = {}
        caption_items = {}
        duplicates = []
        async for message in client.iter_messages(entity, limit=None):
            item = parse(message)
            if not item:
                continue
            key = identity(item["title"], item["year"])
            quality = item["quality"].strip().lower()
            prior = old.get(item["id"], {})
            slug = slug_by_identity.get(key) or item.get("caption_slug") or prior.get("slug_id") or secrets.token_urlsafe(12)
            slug_by_identity[key] = slug
            variant = {k: item[k] for k in ("telegram_message_id", "file_size", "file_name", "mime_type")}
            if key not in groups:
                base = old_groups.get(key, {})
                movie = {"id": base.get("id", item["id"]), "slug_id": slug, "title": base.get("title", item["title"]), "year": item["year"], "qualities": {}}
                for field in ("imdb_id", "poster", "genre", "runtime", "director", "cast", "plot", "imdb_rating", "metadata_status"):
                    if field in base: movie[field] = base[field]
                if not movie.get("metadata_status"):
                    movie.update(omdb(movie["title"], movie["year"]))
                movie.setdefault("metadata_status", "unmatched")
                groups[key] = movie
            movie = groups[key]
            for field in ("imdb_id", "poster", "genre", "runtime", "director", "cast", "plot"):
                if item.get(field): movie[field] = item[field]
            if quality in (q.lower() for q in movie["qualities"]):
                duplicates.append((item["title"], item["year"], item["quality"], message.id))
                continue
            movie["qualities"][item["quality"]] = variant
            caption_items[message.id] = {**item, "slug_id": slug}
        if duplicates:
            print("Duplicate qualities skipped (newest Telegram file wins):", duplicates)
        for movie in groups.values():
            poster = str(movie.get("poster") or "")
            preferred = imdb_poster(movie.get("imdb_id"))
            if preferred:
                movie["poster"] = preferred
                continue
            needs_wikipedia = (
                poster == FALLBACK_POSTER
                or poster.startswith("https://upload.wikimedia.org/")
                or not poster_is_valid(poster)
            )
            if needs_wikipedia:
                movie["poster"] = wikipedia_poster(movie["title"], movie["year"]) or FALLBACK_POSTER
        current = []
        for movie in groups.values():
            variants = sorted(movie["qualities"].items(), key=lambda pair: (pair[0].lower() != "720p", pair[0].lower()))
            preferred_quality, preferred = variants[0]
            movie.update({**preferred, "quality": preferred_quality})
            current.append(movie)
        if not current and old_movies:
            raise RuntimeError("Refusing to replace a nonempty catalog with an empty Telegram scan")
        current.sort(key=lambda m: m["telegram_message_id"], reverse=True)
        changed = current != old_movies or previous.get("schema_version") != 2
        if changed:
            PATH.parent.mkdir(parents=True, exist_ok=True)
            PATH.write_text(json.dumps({"schema_version": 2, "updated_at": datetime.now(timezone.utc).isoformat(), "movies": current}, ensure_ascii=False, indent=2) + "\n")
            print("Catalog updated:", len(current), "movies")
        else:
            print("No catalog changes")

        # Only write captions after the catalog has successfully persisted its
        # stable slug IDs. Reruns also repair captions left behind by failed edits.
        # Never modify the movie file, its filename, or the catalog slug.
        by_message_id = caption_items
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

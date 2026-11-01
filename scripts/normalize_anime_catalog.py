"""Normalize anime episode slugs from Telegram message IDs only.

This intentionally removes historical random slugs and slug aliases. The Telegram
caption normalizer writes the same IDs back to the channel.
"""
import base64
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ANIME = DATA / "anime.json"


def fixed_slug(message_id):
    digest = hashlib.sha256(f"filmgo-anime-episode:{int(message_id)}".encode()).digest()[:12]
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def normalize_variant(value):
    item = dict(value)
    message_id = item.get("telegram_message_id")
    if message_id:
        item["slug_id"] = fixed_slug(message_id)
    item.pop("slug_aliases", None)
    return item


def main():
    document = json.loads(ANIME.read_text(encoding="utf-8"))
    for show in document.get("anime", []):
        if show.get("slug_id") == "attack-on-titan":
            show["season_banners"] = {
                "OAD": "/banners/attack-on-titan-oad.webp",
                **{str(number): f"/banners/attack-on-titan-season-{number}.webp" for number in range(1, 5)},
            }
        compact = {}
        for episode in show.get("episodes", []):
            variants = episode.get("qualities") or {
                str(episode.get("quality") or "720P").upper(): episode
            }
            normalized = {
                quality: normalize_variant(value)
                for quality, value in variants.items()
            }
            identity = (
                episode.get("special_type") or "",
                int(episode.get("season") or 1),
                int(episode.get("episode") or episode.get("number") or 0),
                int(episode.get("part") or 0),
            )
            compact[identity] = normalized
        episodes = []
        for variants in compact.values():
            preferred = next(
                (key for key in variants if key.casefold() == "720p"),
                sorted(
                    variants,
                    key=lambda key: int("".join(ch for ch in key if ch.isdigit()) or 0),
                    reverse=True,
                )[0],
            )
            primary = dict(variants[preferred])
            primary["qualities"] = variants
            episodes.append(primary)
        episodes.sort(key=lambda item: (
            int(item.get("season") or 1),
            int(item.get("episode") or item.get("number") or 0),
            int(item.get("part") or 0),
        ))
        show["episodes"] = episodes
    document["updated_at"] = document.get("updated_at")
    ANIME.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    split_dir = DATA / "anime"
    split_dir.mkdir(exist_ok=True)
    index = {
        "schema_version": document.get("schema_version", 1),
        "updated_at": document.get("updated_at"),
        "anime": [],
    }
    for show in document.get("anime", []):
        (split_dir / f"{show['slug_id']}.json").write_text(
            json.dumps({"schema_version": 1, "updated_at": document.get("updated_at"), "anime": show}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        index["anime"].append({key: value for key, value in show.items() if key != "episodes"})
    (split_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

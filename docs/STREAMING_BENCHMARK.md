# Experimental streaming benchmark

This branch contains an experimental FilmGo gateway based on the reference bot's
Pyrogram/raw `upload.GetFile` method. It is not merged into `main`.

## Architecture

`FILMGO_FAST_STREAM=1` starts `src/telegram_stream_fast_server.py` on localhost
port `8766`. FilmGo still performs its existing authentication, token accounting,
catalog lookup, HTTP range validation, MIME headers, and access checks. Only the
localhost Telegram byte gateway changes.

The experimental gateway uses the reference design: Pyrogram clients, cached
file properties, aligned 1 MiB raw Telegram chunks, persistent media sessions,
file-reference refresh, a bounded concurrency semaphore, and least-loaded
client selection through `STREAM_MULTI_TOKEN*`.

It reads the original message IDs from `TELEGRAM_CHANNEL_ID`; it does not need a
BIN channel or modify `data/movies.json`. A bot token must be able to read the
FilmGo source channel. Multiple bot tokens are optional and improve concurrent
viewer capacity, not the speed of one individual stream.

## Local installation

```sh
python3 -m venv /tmp/filmgo-stream-venv
source /tmp/filmgo-stream-venv/bin/activate
pip install -r requirements-fast-stream.txt
```

Required runtime settings for the experimental path are the existing Telegram
API/session settings plus `BOT_TOKEN` or `STREAM_BOT_TOKEN`. Optional
`STREAM_MULTI_TOKEN1`, `STREAM_MULTI_TOKEN2`, ... add clients.
Each configured client verifies access to `TELEGRAM_CHANNEL_ID` during startup;
the fast gateway does not advertise itself as ready when a configured token
cannot read the source channel. Stream slots are reserved before client
selection, and file-reference refresh continues from the next unread Telegram
offset. If the fast gateway is unavailable before response headers, FilmGo
tries its persistent Telethon gateway before the legacy subprocess fallback.

## Benchmark

Run:

```sh
node scripts/benchmark-streaming.mjs
```

The script compares a local model of the existing smaller-range/process-style
path with a local model of the persistent 1 MiB path. It is a gateway overhead
benchmark only; it does not claim to measure Telegram DC bandwidth. A real
comparison requires the same movie, same server, same Telegram DC, same client,
and repeated cold/warm runs.

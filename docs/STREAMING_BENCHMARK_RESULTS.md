# FilmGo streaming experiment — benchmark report

Branch: `experiment/biisal-streaming-benchmark`

This is an isolated experiment. `main` is unchanged and the experiment has not
been deployed or connected to real Telegram credentials.

## What changed in this branch

- Added a separate Pyrogram gateway at `src/telegram_stream_fast_server.py`.
- Added a separate Node bridge at `src/fast-stream-worker.mjs`.
- Added `FILMGO_FAST_STREAM=1` selection in the server branch only.
- Preserved FilmGo authentication, token accounting, catalog lookup, range
  validation, MIME handling, and access checks.
- The experimental gateway reads the original FilmGo channel directly through
  `TELEGRAM_CHANNEL_ID`; it does not copy files to a public/BIN channel and does
  not edit `data/movies.json`.
- Added `scripts/benchmark-streaming.mjs` and dependency instructions.

## Local installation and checks

Installed in a temporary virtual environment outside the repository:

- Pyrogram `2.0.106`
- TgCrypto `1.2.5`
- aiohttp `3.9.5`

Passed:

- Node syntax check for the experimental bridge and benchmark.
- Python bytecode check for the experimental gateway.
- `git diff --check`.

## Synthetic benchmark

Command:

```sh
node scripts/benchmark-streaming.mjs
```

Run: 64 MiB over a local loopback mock gateway.

| Path model | Time | Throughput |
|---|---:|---:|
| Existing-like smaller-range/process overhead | 0.328 s | 194.99 MiB/s |
| Reference-style persistent 1 MiB gateway | 0.154 s | 415.16 MiB/s |

Measured synthetic speedup: **2.13x**.

This number is not a Telegram performance claim. It models local connection and
chunk overhead only. Real speed depends on Telegram DC, server region, source
file DC, bot/user permissions, CPU, network, browser buffering, and concurrent
viewers.

## Expected production effect

The largest expected improvement is when the existing persistent Telethon worker
is unavailable and FilmGo falls back to spawning `telegram_stream.py` for each
range. In that case the experimental path avoids repeated process startup,
client connection, and dialog lookup.

When the current persistent worker is already healthy, the improvement should be
smaller. The experimental path changes 512 KiB Telegram requests to aligned 1 MiB
requests and optionally adds least-loaded Pyrogram bot clients. Multiple clients
primarily improve concurrent-viewer capacity; they do not split one viewer's
stream across multiple bots.

## Real benchmark still required

For a final decision, run both paths against the same movie and server with:

1. cold first-byte measurement;
2. warm first-byte measurement;
3. sustained MiB/s for 30–60 seconds;
4. 1, 2, 5, and 10 concurrent viewers;
5. range-seek and quality-switch tests;
6. expired Telegram file-reference recovery tests;
7. browser playback tests for MP4, MKV, H.264, and HEVC.

The experimental branch is not suitable for merging based on the synthetic
result alone.

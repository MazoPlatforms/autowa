# Streaming latency: first load and seek

Changes on top of `experiment/biisal-streaming-benchmark`. Goal: lower the time to the
first byte on a cold start and after every seek (a seek is a new HTTP Range request).

## Where the time went (before the first byte of a seek)

| # | Step | Cost |
|---|---|---|
| 1 | `authenticated()` -> Upstash REST `GET session:...` | one HTTPS round trip, every request |
| 2 | `reserveDailyTokens()` -> Upstash `EVAL` | one more round trip, every request |
| 3 | gateway: message lookup (`get_messages`) on a cold cache | one Telegram round trip |
| 4 | gateway: first use of a DC -> new auth key (DH) + Export/ImportAuthorization | about 1-3 s, first viewer per DC |
| 5 | gateway: first part was a full 1 MiB and nothing was sent until all of it arrived | 1 MiB / link speed |
| 6 | cache wiped every 30 min | a cold start again for the next viewer |

Steps 1-2 happen in `server.mjs`, 3-6 in `telegram_stream_fast_server.py`.

## What changed

### `src/telegram_stream_fast_server.py`
- **Small first part, then ramp up.** Parts are 128 KiB, 256 KiB, 512 KiB, then 1 MiB. The first byte
  no longer waits for a full MiB. Every part is a power of two, offset is a multiple of its size, so it
  is valid under any reading of Telegram's `upload.getFile` alignment rules (property-tested on 20,000
  random ranges).
- **Pipelining.** Up to 3 `GetFile` requests per stream are in flight at once (`STREAM_PIPELINE`),
  delivered strictly in order. Leaving the stream (seek, close) cancels the pending ones.
- **Pre-warm at start-up.** The newest catalog files (`data/movies.json`) are looked up in one batched
  call and a media session is opened for every DC they live in, before the gateway reports `READY`.
  The first viewer no longer pays for lookup or DH.
- **One session per DC.** A lock stops two simultaneous first viewers from both creating an auth key.
- **No periodic wipe.** File references are refreshed in the background every 20 min and kept 30 min.
  An expired reference is still refreshed on demand, resuming at the next byte (no duplicates).
- **`WARM <message_id>` command** so Node can prepare a file while it is busy with auth and tokens.

### `src/fast-stream-worker.mjs`
- New `fastWarm(messageId)` (fire-and-forget).

### `src/server.mjs`
- **Session check cache for the stream route only** (`AUTH_STREAM_CACHE_MS`, default 30000, 0 turns it off).
  The signed token is still verified on every request; only the "session not revoked" Upstash lookup is
  cached. Logout clears the entry immediately. A revoked session can stream for at most that many
  milliseconds longer.
- `fastWarm()` is called as soon as the movie is resolved, in parallel with auth and token checks.
- **One timing line per range request:**
  `FilmGo stream timing {"auth_ms":..,"reserve_ms":..,"gateway_ms":..,"first_byte_ms":..,"path":"fast"}`

## Reading the timing line

| Large value | Meaning | Fix |
|---|---|---|
| `auth_ms` (only on a cache miss) | Upstash is far from the server | use an Upstash region near the origin |
| `reserve_ms` | Upstash `EVAL` round trip, once per range request | same; or larger ranges |
| `gateway_ms` on the first request after a deploy | pre-warm did not cover that file/DC | raise `STREAM_PREWARM_MESSAGES` |
| `gateway_ms` always large | Telegram round trip is slow from the origin region | host the origin closer to Telegram's DCs |
| `path` is `telethon` | the fast gateway was not ready or was busy | check the `Fast stream worker` log lines |

## New environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `STREAM_FIRST_PART_KIB` | 128 | size of the first part of a range (power of two, 4-1024) |
| `STREAM_PIPELINE` | 3 | parallel Telegram requests per stream |
| `STREAM_PREWARM_MESSAGES` | 40 | catalog files resolved at start-up |
| `STREAM_PREWARM_TIMEOUT` | 25 | seconds to wait for pre-warm before reporting READY |
| `STREAM_REF_TTL` | 1800 | seconds a looked-up file is reused |
| `STREAM_REFRESH_SECONDS` | 1200 | background refresh interval |
| `AUTH_STREAM_CACHE_MS` | 30000 | session-check cache for streaming |
| `FILMGO_CATALOG_PATH` | `data/movies.json` | catalog used for pre-warm |

## Tested

Against a strict fake Pyrogram (rejects any invalid part, models 80 ms latency and 8 MiB/s per request):
byte-exact output for awkward ranges, ERR lines only before `OK`, abort cancels in-flight parts,
reference expiry mid-stream resumes without duplicates, pre-warm creates one DC session and one batched
lookup, 6 concurrent viewers through the real Node bridge. In that model the first byte after a cold
start dropped from about 950 ms to about 120 ms and a seek from about 300 ms to about 120 ms.
**These are simulated numbers that prove the mechanics, not Telegram speed.** Real figures need the
`first_byte_ms` log lines from your deployment.

## Not covered by these changes

- **File layout.** An MP4 with `moov` at the end, or an MKV whose cues are at the end, makes the player
  issue extra range requests before playback or after a seek. Remux once with
  `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`. (MKV has no faststart; the browser needs the
  cues, which usually sit near the end.)
- **HEVC/H.265 MKV** often does not play natively in browsers; that is a codec limit, not streaming speed.
- **Region.** Origin, Upstash and Telegram's DCs should be close to each other and to viewers.
- **Pyrogram 2.0.106** is unmaintained; plan a move to a maintained fork before Telegram changes break it.


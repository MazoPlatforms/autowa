# FilmGo — experimental Cloudflare streaming Worker

This is a **separate experimental deployment**, not a verified production replacement for Koyeb.

## Setup

1. In this folder run `npm install` and `npm run check`. Resolve any GramJS/Workers compatibility errors before deployment.
2. Set Cloudflare secrets with `npx wrangler secret put TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, and `TELEGRAM_CHANNEL_ID`.
3. Run `npm run deploy` to create the Worker.
4. Test `/health`, `HEAD /stream/{slug_id}`, `GET /stream/{slug_id}` with `Range: bytes=0-1023`, seek, download, and concurrent playback using a rights-cleared test file.

The Worker reads the published GitHub catalog, not a database. It does not upload media to Cloudflare or save files. Telegram connection reuse is best-effort per isolate, not guaranteed. Browser player integration remains on the existing Koyeb backend until tests pass.

**Important:** GramJS in Workers, CPU usage, byte accuracy and runtime compatibility have not been validated. Do not add Telegram session strings to Git or wrangler.toml. Free-tier suitability is unproven. CORS origin checks do not provide access control for direct downloads.

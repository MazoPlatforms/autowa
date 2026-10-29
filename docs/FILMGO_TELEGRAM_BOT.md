# FilmGo Telegram Admin Bot

The existing Koyeb Node.js API also runs a Telegram Bot API long poller. It is **not** deployed to Cloudflare. Cloudflare remains dedicated to streaming. GitHub Actions runs heavy remote media imports and the existing catalog synchronization workflow.

## Required Koyeb variables

- `BOT_TOKEN` — existing Telegram bot token.
- `FILMGO_BOT_ADMIN_ID=7744742903` — exact Telegram numeric user ID, not a username.
- `TELEGRAM_CHANNEL_ID` — the existing channel ID (typically `-100...`).
- `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPOSITORY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — existing app configuration.
- Existing `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` for channel indexing.

The bot **must be added as an administrator to the media channel**, with permission to see channel posts. A bot added after an upload cannot reliably receive old channel posts; the existing scheduled sync remains as a backstop. Configure the Koyeb service as always-on, not scale-to-zero. Only one service should own this bot token's updates. The polling offset and duplicate channel-message IDs are stored in Redis.

## Commands (admin's private chat only)

- `/start` and `/help` — commands.
- `/status` — basic bot status.
- `/download https://example.com/Movie.2026.1080p.mkv` — create a pending import confirmation.
- `/download https://drive.google.com/file/d/FILE_ID/view` — Google Drive file import.

Confirm or cancel the import with the inline buttons. Confirmation is required for **every** import, including large files. Actual content length is checked on the GitHub runner; files over 2 GB, non-video file extensions, non-HTTPS direct URLs, and unsupported Drive links fail. GitHub Actions has a 180-minute job limit. Google Drive must permit access to the file, and downloads may fail due to Google quota or access controls.

An import uses the existing authenticated Telethon session to upload to the configured channel. Bot API upload limits do not apply to that Telethon user upload. Filename inference is best-effort: year and quality must be recognizable; otherwise the file remains excluded from the public catalog until metadata is corrected. A channel post triggers an immediate Koyeb Redis catalog refresh and GitHub Actions metadata sync. Existing six-hour sync remains a backstop.

## Security and limitations

- Only the configured numeric admin user ID in its own private chat can issue commands or approve imports. Username and phone number are not authentication credentials.
- Never paste the bot token, GitHub token or Telethon session into chat or the repository.
- Direct URL downloads are executed in an isolated GitHub Actions runner, not by the Koyeb web server. They are restricted to HTTPS and public IPs with redirect checks. Google Drive imports use `gdown`.
- The initial approval displays **unknown size** if not available before download. GitHub Actions enforces the 2 GB maximum after receiving metadata and while streaming direct downloads; Drive downloads are checked immediately after completion.
- Only import or distribute media for which you have permission or the necessary rights.
- End-to-end verification requires a live bot, channel administrator access, and configured GitHub Actions production secrets; commits alone do not prove those services are operational.

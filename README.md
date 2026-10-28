# Community WhatsApp Media Uploader

Simple GitHub Actions + JSON queue for **media you own or are authorized to redistribute**.

## Setup
1. Create a GitHub repository and upload these files. Use **private** while setting up.
2. Create one `movies/<id>.json` per movie (see `movies/sample-001.json`): edit title, direct HTTPS URL, filename, caption, WhatsApp group IDs, and file type. Set `license_confirmed: true` **only with documented redistribution rights**, then `enabled: true`.
3. WhatsApp authentication: set the **production environment** secret `WA_AUTH_CREDS` to the plain-text JSON contents of a registered Baileys `creds.json`. Note: creds-only sessions can fail without other Signal key files, and runner-side session updates are not persisted. Never commit credentials.
4. Create a GitHub `production` environment with required reviewer approval. Restrict who can push to the default branch.
5. GitHub → Actions → **Publish authorized media** → Run workflow; optionally enter one job ID.

## Per-movie files
Each file must be named `<id>.json` and contain one movie object (not a `jobs` array). Keep disabled until redistribution rights are verified. Run Actions manually and provide the movie ID to publish just one file. Leave blank to publish all enabled files (including ones already published); there is no persistent deduplication yet.

## Local validation / testing
```bash
node src/validate.mjs
npm install
DRY_RUN=1 node src/publish.mjs
```
The included sample is disabled and its URL is a placeholder. Real delivery cannot be verified without your own valid licensed media, paired WhatsApp session, and target group membership.

## Safety and limits
- Pull requests run validation **without secrets**. Publishing is manually triggered on a protected environment, not on untrusted PRs.
- Baileys is an **unofficial WhatsApp client**; automated messaging may cause account restrictions. Use only groups where you have permission; avoid unsolicited bulk sending.
- `sendMessage` returning a message ID indicates submission, not recipient delivery.
- Downloads are HTTPS-only, reject non-public resolved IP addresses, and are limited to 2 GB per file. Community URL submission still needs maintainer review (redirects, DNS changes, media rights).
- GitHub Actions runtime, bandwidth, and storage policies apply. No guarantee large files upload successfully.
- Do not reuse any WhatsApp credentials previously pasted into shared scripts or chats: revoke that linked device and pair a new session.
- Unlike the original notebook, this version deliberately excludes forged reply/forwarded metadata, interactive group selection, and Colab widgets.

# Community WhatsApp Media Uploader

Simple GitHub Actions + JSON queue for **media you own or are authorized to redistribute**.

## Setup
1. Create a GitHub repository and upload these files. Use **private** while setting up.
2. Create one `movies/<id>.json` per movie (see `movies/sample-001.json`): edit title, direct HTTPS URL, filename, caption, WhatsApp group IDs, and file type. Set `license_confirmed: true` **only with documented redistribution rights**, then `enabled: true`.
3. WhatsApp authentication: set the **production environment** secret `WA_AUTH_CREDS` to the plain-text JSON contents of a registered Baileys `creds.json`. Note: creds-only sessions can fail without other Signal key files, and runner-side session updates are not persisted. Never commit credentials.
4. Create a GitHub `production` environment with required reviewer approval. Restrict who can push to the default branch.
5. Adding a new enabled and licensed `movies/<id>.json` to `main` automatically triggers publishing. You can also run **Publish authorized media** manually with a movie ID.

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

## Automatic jobs and GitHub Pages
- Each movie is a separate JSON file. On first processing the publisher assigns `job_id`, `status=processing`, and `started_at`, then records `submitted` or `failed` and `finished_at`.
- Job fields are committed back to the default branch by GitHub Actions. Allow GitHub Actions to write repository contents and ensure branch rules permit the bot to commit; otherwise status will not persist and repeat processing is possible.
- A new enabled file with `license_confirmed: true` is processed automatically on push to `main`. Existing files with `job_id` are skipped on automatic runs. Manual runs with the movie `id` or assigned `job_id` can retry.
- To enable the public dashboard, GitHub Settings → Pages → Build and deployment → Source: **GitHub Actions**. The dashboard displays only movie title, job ID, status, and start time. It does not display source URLs, group IDs, or credentials.
- GitHub Actions job results are not proof of delivery. If the process crashes before its state commit, a future run can retry; this starter cannot guarantee exactly-once delivery.
- Publishing depends on the `production` environment secret `WA_AUTH_CREDS`. Authentication may fail with only `creds.json` because Baileys normally needs additional persisted keys.

## Premium GitHub Pages site
The dashboard uses Google Fonts Inter, mobile-friendly cards, status tracking, and a browser-only movie JSON builder. Open the Pages URL after selecting GitHub Actions as the Pages deployment source. The form downloads or copies JSON; it cannot write directly to GitHub without authentication. Upload `<id>.json` to `movies/` through a reviewed contribution.

## How to find a WhatsApp group JID
Use a trusted local machine with an existing, paired Baileys auth directory containing `creds.json` and its other Signal key files:
```bash
npm install
WA_AUTH_DIR=/private/path/to/auth npm run groups
```
This prints each joined group's **name** and **JID** locally. Never paste credentials into the public website. Group invite links and visible group names are not reliable substitutes for JIDs.

**Privacy:** A movie JSON committed to a public repository exposes its `group_ids` to the public. Do not publish private group identifiers; use a private repo or change the system to use secret-side group aliases before production use. The dashboard itself does not display JIDs.

# Community WhatsApp Media Uploader

## Koyeb web service: verified public requests (deployment-ready configuration)

This repository includes a separate **Koyeb API + public web form**. Visitors do not need GitHub accounts. The Koyeb service does **not** download or upload movies: it verifies WhatsApp ownership, then sends a private `repository_dispatch` event to GitHub Actions. The `Process verified AutoWA request` workflow stages the request in the runner (not in Git), awaits the `production` environment approval gate, and runs the existing publisher.

### Deploy (Baileys OTP on Koyeb)
1. Create an **Upstash Redis** database with REST URL/token. The Koyeb OTP bot persists its complete Baileys authentication state (creds **and** Signal keys) to encrypted Redis values. Do not delete the Redis keys or change `APP_SECRET` after pairing.
2. In Koyeb, deploy the repository root **Dockerfile** as a Web Service. HTTP port: **8000**; health path: **/health**. Run **one** OTP bot replica only: multiple replicas can corrupt a shared Baileys session.
3. Add these **Koyeb secret environment variables**:

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Strong random secret, at least 32 characters, used for HMAC and AES-256-GCM encryption |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `GITHUB_DISPATCH_TOKEN` | GitHub fine-grained PAT with Contents write access to dispatch repository events |
| `GITHUB_REPOSITORY` | `MazoPlatforms/autowa` |
| `WA_OTP_AUTH_CREDS` | **Optional bootstrap only**: an unregistered Baileys creds JSON; a registered `creds.json` alone is incomplete without Signal keys and is ignored for a fresh QR pairing |
| `PORT` | Optional, defaults to 8000 |

4. **Pair OTP bot**: On first startup, look for a QR in **private Koyeb service logs** and scan it with WhatsApp → Linked devices → Link a device. Once connected, the bot saves encrypted auth data in Redis and reconnects automatically. Do **not** expose logs containing QR codes or secrets. If QR output is unreadable in the hosting logs, pairing requires a separate secure setup route; it has not been implemented.
5. Create a GitHub **production environment** with required reviewer approval (if your repository plan/settings support it) and the `WA_AUTH_CREDS` environment secret for the **separate movie publisher bot**. The publisher's creds-only authentication is still unreliable without its matching Signal keys.
6. Test OTP to your own WhatsApp number, then a small authorized media file through a reviewed GitHub Actions dispatch. Do not open public registration until real tests pass.

**No Meta WhatsApp Cloud API credentials are required.** OTP sending now uses Baileys on Koyeb. Unofficial WhatsApp automation may be rate-limited or lead to account restrictions.

### Security and limitations
- OTP: six digits, 5-minute expiry, 60-second resend cooldown, bounded verification attempts, 15-minute one-time signed session. Each verified session submits at most one request; daily per-number limits apply.
- A request can **only target the verified WhatsApp number**; no arbitrary personal recipients or public group selection in the new Koyeb form. The publisher still includes its two preconfigured internal groups. These must be authorized distribution destinations.
- Public form requires explicit distribution-rights confirmation, but **self-attestation is not proof**. A trusted reviewer must approve every media job before GitHub Actions processes it.
- Request details are passed as GitHub event payload and exist in GitHub Actions event context and runner filesystem; they are **not public movie JSON commits**. Restrict repository/workflow visibility and access, and be mindful of Actions event retention. Avoid putting personal phone numbers in workflow logs.
- `repository_dispatch` acceptance is **queue submission, not delivery**. No cross-system status callback, retry deduplication, or production-tested WhatsApp delivery guarantee exists yet.
- Do not place `WA_AUTH_CREDS`, Meta credentials, Redis tokens or GitHub tokens in the frontend or repository. For a public rollout, add moderation, abuse monitoring and robust session-key persistence.
- Koyeb/Upstash/Meta/GitHub free allowances and billing eligibility can change; verify current account limits before deployment.
- Existing GitHub Pages generator is separate and remains available for operator use. Public users should use the Koyeb URL instead.

### Local syntax / launch
```sh
node --check src/server.mjs
node --check src/stage-request.mjs
node --check web/app.js
# Set all required environment variables before running:
npm start
```


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


## Inactive reference: quoted and forwarded message metadata

The following is **documentation-only example code**. It is **not imported, executed, or connected** to the publishing workflow. It does not change sent WhatsApp messages, create genuine quoted messages, or establish actual forwarding history. Do not represent fabricated requests or forwarding provenance as authentic.

```js
// REFERENCE ONLY — INACTIVE. Not used by src/publish.mjs.
const FAKE_REPLY_ENABLED = true;
const FAKE_REPLY_TEXT = 'This movie was requested by our group participant.';
const FAKE_REPLY_PARTICIPANT = '94779290433@s.whatsapp.net';
const FORWARDING_ENABLED = true;
const FORWARDING_SCORE = 127;

// Illustrative metadata shape; deliberately never passed to sock.sendMessage().
const inactiveMetadataExample = {
  quoted: {
    key: { remoteJid: '<destination-jid>', participant: FAKE_REPLY_PARTICIPANT },
    message: { conversation: FAKE_REPLY_TEXT }
  },
  contextInfo: {
    isForwarded: FORWARDING_ENABLED,
    forwardingScore: FORWARDING_SCORE
  }
};
void FAKE_REPLY_ENABLED;
void inactiveMetadataExample;
```

These values are retained as reference notes only. The active publisher does not use them.

# Community WhatsApp Media Uploader

Simple GitHub Actions + JSON queue for **media you own or are authorized to redistribute**.

## Setup
1. Create a GitHub repository and upload these files. Use **private** while setting up.
2. `movies/jobs.json`: edit title, direct HTTPS URL, filename, caption, WhatsApp group IDs, and file type. Set `license_confirmed: true` **only with documented redistribution rights**, then `enabled: true`.
3. WhatsApp authentication: use an **already paired** Baileys multi-file auth directory from a trusted local machine. Bundle every `.json` file, not only `creds.json`, into a JSON object keyed by filename. Base64 encode the UTF-8 JSON and store as the GitHub Actions repository secret `WA_AUTH_B64`. Never commit auth files, token dumps, logs containing secrets, or personal phone numbers.
4. Create a GitHub `production` environment with required reviewer approval. Restrict who can push to the default branch.
5. GitHub → Actions → **Publish authorized media** → Run workflow; optionally enter one job ID.

## Auth bundle (run locally only)
From the directory containing your `auth/` folder:
```bash
python3 - <<'PY'
import base64,json,pathlib
p=pathlib.Path('auth')
data={f.name:json.loads(f.read_text()) for f in p.glob('*.json')}
assert 'creds.json' in data
pathlib.Path('auth-bundle.b64').write_text(base64.b64encode(json.dumps(data).encode()).decode())
print('Saved auth-bundle.b64 — keep private; paste its contents into GitHub secret WA_AUTH_B64.')
PY
```
**Warning:** GitHub Actions runners are ephemeral. Baileys auth state can rotate during a run; this starter does **not** persist refreshed session keys back into GitHub Secrets. Re-pair or update the secret from a trusted environment as necessary. This can cause intermittent authentication failures. For reliable long-term publishing, use a persistent private runner/server and encrypted auth storage.

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

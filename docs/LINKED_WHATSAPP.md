# Linked WhatsApp delivery

Signed-in users link their own number from Profile → WhatsApp delivery. They
must explicitly consent and choose QR or pairing code. Scan the QR from another
screen using WhatsApp → Linked devices → Link a device, or choose Link with
phone number instead and enter the custom code `FILMGOWA`. The linked
account must match their FilmGo account. Documents go only to Message yourself.
A newly connected account sends a connected notification to `+94771227821`.
This destination is fixed on the server and disclosed in the linking consent.
Notification state and a stable message ID persist across reconnects; temporary
send failures retry up to three times. The test-file button/endpoint is removed.

The website's movie and anime WhatsApp actions enqueue work in the persistent
server queue. This path no longer dispatches user delivery through GitHub Actions.
Streaming and Telegram actions continue to use their existing endpoints.

## Storage and operation

- Credentials, Signal keys, account metadata and jobs are AES-256-GCM encrypted.
  Per-account keys use HKDF with `WHATSAPP_LINK_SECRET` (optional) or `APP_SECRET`.
  Keep that secret stable, at least 32 characters, and outside Redis. Changing it
  requires relinking existing accounts. Never put session strings in logs/artifacts.
- A renewable Redis lease plus fenced auth writes allows one worker per account
  during rolling deployments. Up to 20 sockets are opened per instance; excess
  accounts reconnect as capacity becomes available. Only one document transfer
  runs per instance. Registered sessions restore from Redis on startup.
- Pairing expires after five minutes. Incomplete auth has a ten-minute TTL.
  Disconnect revokes the lease, cancels work and deletes local stored credentials.
  If remote logout fails, the UI instructs removal from WhatsApp Linked devices.
- Queue claim uses Redis RPOPLPUSH. Interrupted downloads can resume via a fresh
  download. A job interrupted during upload is marked failed instead of resent;
  users must check Message yourself before requesting again.
- At most three pending requests per account, with API rate limits and daily
  token reservation. Failed jobs refund once. History retains the latest 100 jobs.
- Files use private temporary directories and are removed after the transfer.
  The existing Telegram session on the server downloads the selected media.
  Max file size is 2,000,000,000 bytes. Disk capacity must cover an entire file.

## Checks

Run `node --test test/linked-whatsapp.test.mjs`. Unit/integration tests use an
in-memory Redis adapter and simulated sockets; they do not log into WhatsApp.
Browser checks exercise consent, pairing code, connected state, delivery history,
disconnect, and mobile/desktop layout with simulated API responses.

A real user must complete pairing to verify live transport. The acceptance check
is: pair through code and QR → verify the connected notification at the configured
number → receive an authorized media document in Message yourself → restart
and restore → disconnect → confirm device removal. Automated passing tests alone
do not prove WhatsApp accepted a real login or delivered a document.

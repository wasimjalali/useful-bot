# Feedback service

Cloudflare Worker + D1 behind Settings > Feedback in the macOS app. D1 is the source of truth; email
only notifies. Every Problem is emailed right away, and a digest of the week goes out on Mondays at
07:00 UTC. Mail is sent from `feedback@usefulbuild.com` to `hello@usefulbuild.com` through Cloudflare
Email Sending, and the binding can't send anywhere else. `usefulbuild.com` mail is Google Workspace:
never enable Email Routing on it.

## API

`POST https://feedback.usefulbuild.com/v1/feedback`, `Content-Type: application/json`:

```json
{
  "kind": "idea | problem | other",
  "message": "1 to 4,000 characters, trimmed",
  "replyEmail": "optional, or null",
  "installId": "a UUID the app creates once",
  "context": { "appVersion": "0.3.0", "build": "412", "macosVersion": "15.6.1", "chip": "Apple M1" }
}
```

`context` is null when the owner unticks the box. Replies: `201 {ok, id}`; `400 {error: "invalid",
field, message}`; `413` over 32 KB; `415` not JSON; `429 {error: "rate_limited", scope, message}` with
`Retry-After` after 5 sends per install or 20 per network in 24 hours; `500 {error: "server"}`.

The network is an HMAC of the IP keyed with the `IP_SALT` secret. The raw IP is never stored.

## Deploy

```sh
cd services/feedback && npm ci
npx wrangler d1 migrations apply useful-bot-feedback --remote
npx wrangler deploy
```

`IP_SALT` is already set. A brand-new Worker can't take `wrangler secret put` before it exists, so
the first deploy passed it with `--secrets-file` (a private temp file, deleted right after).

## Deleting someone's feedback

The privacy page promises deletion on request. Find the rows by the sender's reply email (or the
id in their email), check them, then delete:

```sh
cd services/feedback
npx wrangler d1 execute useful-bot-feedback --remote --command "SELECT id, created_at, kind FROM feedback WHERE reply_email = 'them@example.com'"
npx wrangler d1 execute useful-bot-feedback --remote --command "DELETE FROM feedback WHERE id IN ('<id>')"
```

## Check

`npm run e2e` runs 32 cases against `wrangler dev` with a local D1 and simulated email: validation,
both limits (including a parallel burst), which kinds send mail, HTML escaping and the digest window.

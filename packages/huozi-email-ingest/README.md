# huozi-email-ingest

The standalone Cloudflare Worker that turns inbound mail at
`*@mail.huozi.app` into Tasks ingest events. See `app/docs/tasks.md`
§6.1 for the product design and `app/packages/huozi-cloud/src/storage/cloudflare/tasks-ingest.ts`
(specifically `handleTasksEmailIngest`) for the contract this Worker
calls into.

## What it does (and doesn't)

For every inbound mail:

1. Parse the to-address. Reject anything that isn't `t-<token>@…`.
2. Parse the MIME (via [postal-mime](https://github.com/postalsys/postal-mime)).
3. POST the parsed shape + token to huozi-cloud `/admin/tasks/email-ingest`
   over a Cloudflare service binding (no public DNS / TLS hop).
4. Map the upstream response to an Email Routing verdict.

This Worker stores nothing. All state lives in huozi-cloud's D1 / R2.

## Why a separate Worker?

The main `huozi-cloud` Worker can't bind an `email()` handler and still
service its existing HTTP routes — Email Routing requires a Worker
whose primary purpose is mail. Splitting also means the MIME-parsing
dependency (`postal-mime`) only weighs on this Worker's bundle.

## Deploy

```bash
pnpm install
wrangler secret put HUOZI_ADMIN_SECRET   # same value as huozi-cloud
pnpm cf:deploy
```

Then in the Cloudflare dashboard, on the `mail.huozi.app` zone:

1. **Email** → **Email Routing** → **Enable**. This auto-creates the
   MX and SPF records.
2. Verify a destination fallback address (Cloudflare requires one even
   if the catch-all goes entirely to a Worker).
3. **Routes** → **Catch-all address** → **Send to a Worker** →
   pick `huozi-email-ingest`.

## Local development

`wrangler dev --remote` simulates Email Routing locally. From the dev
URL, POST a raw RFC 5322 message to
`/cdn-cgi/handler/email?from=<sender>&to=<recipient>` to trigger the
`email()` handler against a token you've minted in your dev D1.

## Verdicts

| Situation                                  | Verdict                              |
|--------------------------------------------|--------------------------------------|
| Token parses + upstream ok                 | Silent accept (mail stored)          |
| Unknown / revoked token                    | Silent drop (no oracle)              |
| Sender outside allowlist                   | Silent drop                          |
| Malformed MIME                             | Silent drop                          |
| Empty body / no From                       | Silent drop                          |
| `>5 MiB` raw                               | **Reject** (`message.setReject`)     |
| Upstream 5xx                               | **Reject** (sender's MTA retries)    |
| Uncaught exception                         | **Reject** (transient error)         |

Set `DEBUG_LOG_DROPS=1` in `wrangler.toml` (or via `wrangler secret put`)
to see drop reasons in `wrangler tail`. Keep off in production.

## What's intentionally out of scope

- **Outbound replies.** Tasks doesn't auto-reply in v1. Adding a
  `send_email` binding plus a reply event would land in a follow-up.
- **HTML-only mail beautification.** `postal-mime` already computes a
  `text` field from `text/plain` parts (or strips HTML when only HTML
  is present); we use it as-is. Anything fancier — quoting, attachment
  handling, signature trimming — is an agent-side responsibility, not
  this Worker's.
- **Anti-spam.** Cloudflare's edge filtering catches obvious abuse.
  Per-user `allowed_senders` (managed via the Tasks settings UI) is
  the v1 user-facing knob; SpamAssassin headers and Bayesian filters
  are deferred until users ask.

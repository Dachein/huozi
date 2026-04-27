# Security policy

## Reporting a vulnerability

**Don't open a public GitHub issue for security findings.**

If you've found a vulnerability — auth bypass, ACL bypass, secret leakage, audit-trail tamper, RCE, anything that looks like it could compromise a deployed huozi instance — report it privately via either:

- **GitHub Security Advisories** — open one at https://github.com/Dachein/huozi/security/advisories/new (preferred — gets you a CVE if applicable, lets us coordinate the fix in a private branch).
- **Email** — `dachein.x@gmail.com` with subject prefix `[huozi-security]`. PGP / Signal available on request.

Please include:

- A clear writeup of the issue (what's broken, why it matters)
- Reproduction steps — ideally a `curl` / `wrangler` command sequence
- Edition affected (cloud / edge / both) and any versions / commits
- Optional: a suggested fix

We'll acknowledge within **3 business days** and aim to ship a fix within **30 days** for high/critical issues. Smaller / lower-impact issues may take longer, depending on whether a workaround exists.

## What's in scope

The huozi codebase covers two surfaces, both potentially in scope:

1. **The Cloudflare Worker** under `packages/huozi-cloud/` — D1 storage layer, MCP tools, auth, ACL enforcement, share endpoints, admin endpoints.
2. **The Next.js front-end** under `src/` — auth flows (OTP for Cloud, paste-key for Edge), session cookies, RSC layouts that gate workspace access, the `/p/<slug>` public viewer.

Anything in `cloud.huozi.app/*` or any properly-configured Edge deployment is fair game. The marketing site (sibling repo) is out of scope for this policy — it doesn't process secrets or user data.

## What's out of scope

- Issues in third-party dependencies that have already been disclosed (please report those upstream first; we'll bump versions promptly).
- Self-DoS scenarios (e.g. an authenticated admin sending a malformed admin-mint-key body and getting a 500). We don't ship rate limiting yet; bringing your own Cloudflare WAF is recommended for production Edge deploys.
- Issues that require physical access to a deployer's CF dashboard or local machine — we can't help if your `HUOZI_ADMIN_SECRET` was already leaked.
- Edge deployments running with `HUOZI_PUBLIC_BASE` pointed at an attacker-controlled origin — that's a configuration mistake, not a vulnerability.

## Disclosure policy

We follow a **coordinated disclosure** model:

1. Researcher reports privately.
2. We confirm and ship a fix.
3. After the fix is deployed to Cloud (`cloud.huozi.app`) and tagged in a release, we publish the advisory with credit to the reporter (or anonymously, your call).

If a vulnerability is being actively exploited in the wild, we may need to disclose faster than the 30-day target.

## Hall of fame

Reporters who help find issues and want public credit will be listed here once we have any (and once we've shipped fixes).

## Hardening guidance for self-hosters

If you're running the Edge edition:

- **Rotate `HUOZI_ADMIN_SECRET` regularly** (`wrangler secret put`). It only protects the `/admin/*` routes, but a leaked admin secret = ability to mint api_keys for any workspace your worker hosts.
- **Use Cloudflare Access in front of the Worker** if you're running this for a team — Workers' OAuth integration adds a perimeter layer above the api_key cookie.
- **Review the audit log** — `huozi_history` exposes every commit. Pipe it through your own analysis pipeline if you care about insider-threat detection.
- **Keep the Worker up to date** — security fixes ship to `main`; redeploy after pulling.

For the full data model of what's audited and what isn't, see `packages/huozi-cloud/SPEC.md` § 9.

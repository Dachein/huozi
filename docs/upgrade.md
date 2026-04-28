# Upgrading huozi

Two paths depending on which edition you're on. Skip to whichever applies.

- [Cloud users](#cloud-users) — you connect to `cloud.huozi.app/mcp`. Server is upgraded by us; you only refresh your MCP client.
- [Edge self-hosters](#edge-self-hosters) — you run your own Worker. You handle code, schema, secrets, then refresh your MCP client.

---

## Cloud users

The Worker at `cloud.huozi.app/mcp` is upgraded automatically. New tools (e.g. `huozi_upload`, `huozi_download`) become available on the server immediately. **But your MCP client caches the tool list at connect-time**, so you need to make it re-fetch.

### Claude Code

The reliable path is to remove + re-add (forces a full reconnect):

```bash
claude mcp remove huozi
claude mcp add huozi https://cloud.huozi.app/mcp
```

Restarting the Claude Code process is also enough — on restart, it re-runs `tools/list` against every server.

### Cursor / Continue / other MCP clients

Disable + re-enable the huozi server in the client's MCP settings. Or restart the whole client. There's no in-protocol "refresh tools" message, so the connection has to actually drop and reopen.

### Verify

Ask the agent:

> "How many huozi tools are there? List them."

You should see 15. The new ones to spot-check:

- `huozi_upload` — binary uploads (PDF, image, audio, zip, docx, xlsx)
- `huozi_download` — short-lived signed URL for any file
- `huozi_whoami` — self-diagnostic

If the count is still 13 (the pre-upgrade set), the client didn't refresh. Restart it.

### What if my old api_key still works?

It does — keys aren't invalidated by upgrades. The same key just gets new capabilities.

### What if I see "tool not found" errors after refresh?

Means the client is still on the cached list. See above. If `claude mcp remove` + `add` doesn't fix it, fully quit Claude Code (Cmd-Q on macOS, kill the process on Linux) and reopen.

---

## Edge self-hosters

You're running your own Worker against your own D1 + R2. Server-side upgrade has four steps; missing any one will break things in subtle ways.

### 0. Read the changelog first

Before pulling, eyeball `git log origin/main` since your last deploy to check for migrations. Migrations live in `packages/huozi-cloud/migrations/` and are numbered (`0001_…`, `0002_…`, …). If a new file appeared since you last deployed, you'll need to apply it in step 3.

### 1. Pull latest code

```bash
cd <your huozi clone>
git pull origin main
```

### 2. Reinstall deps

The product and worker each have a lockfile. Both need to refresh:

```bash
npm install
cd packages/huozi-cloud && npm install && cd ../..
```

### 3. Apply any new D1 migrations

Find unapplied migrations (anything past your last deploy), then:

```bash
cd packages/huozi-cloud

# Replace `huozi-edge-db` with the database name from your wrangler.edge.toml.
# Replace the migration filename with whichever is new.
npx wrangler d1 execute huozi-edge-db --remote \
    --file migrations/0008_files_content_type.sql \
    --config wrangler.edge.toml
```

Migrations are idempotent at the schema level (they use `IF NOT EXISTS` / `ADD COLUMN` semantics), so re-running by accident is safe — but skipping one is not.

### 4. Set any new secrets

The 0.x → current upgrade adds one secret:

```bash
SECRET=$(openssl rand -base64 32)
echo "$SECRET" | npx wrangler secret put HUOZI_SIGNING_SECRET \
    --config wrangler.edge.toml
```

Without `HUOZI_SIGNING_SECRET`, `huozi_download` is omitted from `tools/list` and `huozi_read`'s binary_ref returns a placeholder URL the agent can't actually fetch. The Worker still serves everything else.

If you've already set the secret on a previous upgrade, this step is a no-op — `wrangler secret put` overwrites, which means *new* signed URLs will work but *outstanding* ones become invalid. That's the correct rotation behavior; just expect any in-flight download URLs to 403.

### 5. Redeploy

Worker first, then Next.js front-end. The order matters because the front-end may call APIs that depend on new Worker behavior:

```bash
# Worker
cd packages/huozi-cloud && npm run cf:deploy

# Next.js
cd ../.. && npm run cf:deploy
```

`cf:deploy` runs `tsc` first (so a type error fails fast before the upload). If `tsc` is unhappy, fix it locally and re-run; don't `--no-verify` past it.

### 6. Verify

```bash
# Replace with your worker's URL.
WORKER=https://your-edge-worker.example.dev

curl -s "$WORKER/health"
# → {"ok":true,"service":"huozi-cloud"}

# Tool count, using your api_key.
curl -s -X POST "$WORKER/mcp" \
    -H "Authorization: Bearer <your api_key>" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
    | jq '.result.tools | length'
# → 15  (after the upload + download + whoami additions)
```

### 7. Refresh MCP clients

Same as the Cloud section above. Edge changes happen on your own URL, not `cloud.huozi.app`, but the client doesn't know that — restart / re-add to make it re-fetch the tool list.

---

## Common gotchas

**My `cf:deploy` succeeded but the new tool isn't showing up in `tools/list`.**

Cloudflare Worker isolates can hold stale code for a minute or so. Wait, then re-curl. If it's still missing after 5 min, check `wrangler deployments list` to confirm the new version actually went live; you may have authenticated to the wrong account.

**My old api_keys don't work anymore after upgrade.**

That shouldn't happen — keys live in `api_keys` (D1), and migrations don't touch them. If they do break, the most likely cause is the migration was applied to the wrong database (e.g. local instead of remote). Check `wrangler d1 list` to see which DB has your data.

**The upgrade introduced a column my schema dump shows, but production reads still 500.**

You ran the migration on the wrong DB, or the migration silently failed. Re-run with `--remote` (NOT `--local`); confirm with:

```bash
npx wrangler d1 execute huozi-edge-db --remote \
    --command "PRAGMA table_info(files_current);" \
    --config wrangler.edge.toml
```

The new column should appear in the output.

**I don't want to take downtime.**

Schema additions in this codebase are backwards-compatible (all columns are nullable, all routes are additive). The recommended order — migrate first, then deploy — gives you zero downtime: old Worker code ignores the new column; new Worker code reads/writes it; the in-between window is fine.

If a future upgrade contains a *breaking* migration (column rename, table drop), it'll be flagged in the release notes with a guided procedure. The current 0008 is purely additive.

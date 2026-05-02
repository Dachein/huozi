#!/usr/bin/env bash
#
# scripts/edge-deploy.sh
#
# One-shot, idempotent deploy of huozi Edge to a Cloudflare account.
# Provisions the BFF + backend worker pair on a custom hostname
# (defaults to edge.huozi.app), proxied DNS, path-pattern routes, fresh
# D1 schema, R2 bucket, bootstrap secrets — and prints a one-shot
# /admin/setup URL for the deployer to open in a browser.
#
# ─── Usage ───────────────────────────────────────────────────────────
#
#   1. Generate a Cloudflare API token at
#      https://dash.cloudflare.com/profile/api-tokens with scopes:
#        Account · Workers Scripts:Edit
#        Account · Account D1:Edit
#        Account · Workers R2 Storage:Edit
#        Zone (huozi.app) · DNS:Edit
#        Zone (huozi.app) · Workers Routes:Edit
#
#   2. export CLOUDFLARE_API_TOKEN=<that token>
#
#   3. (Optional) override defaults via env:
#        EDGE_HOSTNAME=edge.huozi.app
#        EDGE_ZONE=huozi.app
#        EDGE_WORKSPACE_SLUG=demo
#        EDGE_WORKSPACE_NAME="Edge Demo"
#        EDGE_SERV_SCRIPT=huozi-edge-serv-demo
#        EDGE_WEB_SCRIPT=huozi-edge-web-demo
#        EDGE_D1_NAME=huozi-edge-db
#        EDGE_R2_NAME=huozi-edge-blobs
#
#   4. scripts/edge-deploy.sh
#
# Tear down with scripts/edge-teardown.sh.
#

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERV_DIR="$ROOT_DIR/packages/huozi-cloud"

EDGE_HOSTNAME="${EDGE_HOSTNAME:-edge.huozi.app}"
EDGE_ZONE="${EDGE_ZONE:-huozi.app}"
EDGE_WORKSPACE_SLUG="${EDGE_WORKSPACE_SLUG:-demo}"
EDGE_WORKSPACE_NAME="${EDGE_WORKSPACE_NAME:-Edge Demo}"
EDGE_SERV_SCRIPT="${EDGE_SERV_SCRIPT:-huozi-edge-serv-demo}"
EDGE_WEB_SCRIPT="${EDGE_WEB_SCRIPT:-huozi-edge-web-demo}"
EDGE_D1_NAME="${EDGE_D1_NAME:-huozi-edge-db}"
EDGE_R2_NAME="${EDGE_R2_NAME:-huozi-edge-blobs}"

CF_API="https://api.cloudflare.com/client/v4"

# Path patterns that go to the backend worker. Everything else falls
# through to the BFF catch-all. CF picks the most specific match
# regardless of declaration order, but order is kept readable.
SERV_PATHS=(
  "/auth/*" "/admin/*" "/me/*" "/mcp"
  "/events/*" "/shares" "/shares/*"
  "/blobs/*" "/health" "/debug/*"
)

cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*" >&2; }
die()    { red "✘ $*"; exit 1; }

# ─── Pre-flight ──────────────────────────────────────────────────────
[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || die \
  "Set CLOUDFLARE_API_TOKEN. Generate at https://dash.cloudflare.com/profile/api-tokens with the scopes listed in the script header."

command -v jq >/dev/null      || die "Install jq (brew install jq)."
command -v curl >/dev/null    || die "Install curl."
command -v openssl >/dev/null || die "Install openssl."

cyan "▶ Pre-flight"
ACCOUNT_ID=$(curl -fsS "$CF_API/accounts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[0].id') || die "API token rejected — check scopes."
[[ -n "$ACCOUNT_ID" && "$ACCOUNT_ID" != "null" ]] \
  || die "Couldn't read account ID via token."
ZONE_ID=$(curl -fsS "$CF_API/zones?name=$EDGE_ZONE" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[0].id // empty')
[[ -n "$ZONE_ID" ]] || die "Zone $EDGE_ZONE not found in this account."
green "  account=$ACCOUNT_ID  zone=$EDGE_ZONE ($ZONE_ID)"
echo

# ─── 1. D1 database (idempotent) ─────────────────────────────────────
cyan "▶ 1. D1 database: $EDGE_D1_NAME"
D1_ID=$(curl -fsS "$CF_API/accounts/$ACCOUNT_ID/d1/database?name=$EDGE_D1_NAME" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[0].uuid // empty')
if [[ -z "$D1_ID" ]]; then
  D1_ID=$(curl -fsS -X POST "$CF_API/accounts/$ACCOUNT_ID/d1/database" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$EDGE_D1_NAME\"}" \
    | jq -r '.result.uuid')
  green "  created  → $D1_ID"
else
  green "  reused   → $D1_ID"
fi
echo

# ─── 2. R2 bucket (idempotent) ───────────────────────────────────────
cyan "▶ 2. R2 bucket: $EDGE_R2_NAME"
R2_OK=$(curl -fsS "$CF_API/accounts/$ACCOUNT_ID/r2/buckets/$EDGE_R2_NAME" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.success')
if [[ "$R2_OK" != "true" ]]; then
  curl -fsS -X POST "$CF_API/accounts/$ACCOUNT_ID/r2/buckets" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$EDGE_R2_NAME\"}" >/dev/null
  green "  created"
else
  green "  reused"
fi
echo

# ─── 3. Generate wrangler configs ────────────────────────────────────
cyan "▶ 3. Generate wrangler configs"
SERV_TOML="$SERV_DIR/wrangler.edge.toml"
WEB_JSONC="$ROOT_DIR/wrangler.edge.jsonc"

SERV_ROUTES=""
for p in "${SERV_PATHS[@]}"; do
  SERV_ROUTES+="  { pattern = \"$EDGE_HOSTNAME$p\", zone_name = \"$EDGE_ZONE\" },"$'\n'
done

cat > "$SERV_TOML" <<EOF
# Auto-generated by scripts/edge-deploy.sh — DO NOT EDIT BY HAND.
name = "$EDGE_SERV_SCRIPT"
main = "dist/worker/index.js"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

[[rules]]
type = "CompiledWasm"
globs = ["**/*.wasm"]
fallthrough = true

routes = [
$SERV_ROUTES]

[vars]
HUOZI_PUBLIC_BASE = "https://$EDGE_HOSTNAME"
HUOZI_EDGE_WORKSPACE_SLUG = "$EDGE_WORKSPACE_SLUG"
HUOZI_EDGE_WORKSPACE_NAME = "$EDGE_WORKSPACE_NAME"

[[r2_buckets]]
binding = "BLOBS"
bucket_name = "$EDGE_R2_NAME"

[[d1_databases]]
binding = "DB"
database_name = "$EDGE_D1_NAME"
database_id = "$D1_ID"

[[durable_objects.bindings]]
name = "WORKSPACE_DO"
class_name = "HuoziWorkspaceDO"
[[durable_objects.bindings]]
name = "SESSION_DO"
class_name = "HuoziSessionDO"

[[migrations]]
tag = "v1"
new_classes = ["HuoziWorkspaceDO", "HuoziSessionDO"]

[triggers]
crons = ["0 4 * * SUN"]

[observability]
enabled = true
EOF

cat > "$WEB_JSONC" <<EOF
{
  "\$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "$EDGE_WEB_SCRIPT",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "workers_dev": true,
  "routes": [
    { "pattern": "$EDGE_HOSTNAME/*", "zone_name": "$EDGE_ZONE" }
  ],
  "services": [
    { "binding": "CLOUD", "service": "$EDGE_SERV_SCRIPT" }
  ],
  "vars": {
    "HUOZI_EDITION": "edge",
    "HUOZI_EDGE_WORKSPACE_SLUG": "$EDGE_WORKSPACE_SLUG",
    "HUOZI_EDGE_WORKSPACE_NAME": "$EDGE_WORKSPACE_NAME",
    "HUOZI_PUBLIC_BASE": "https://$EDGE_HOSTNAME"
  }
}
EOF

green "  $SERV_TOML"
green "  $WEB_JSONC"
echo

# ─── 4. Apply D1 schema ──────────────────────────────────────────────
cyan "▶ 4. Apply D1 schema"
( cd "$SERV_DIR" \
  && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
     ./node_modules/.bin/wrangler d1 execute "$EDGE_D1_NAME" \
       --file src/storage/cloudflare/schema.sql \
       --remote --config wrangler.edge.toml >/dev/null )
green "  schema applied"
echo

# ─── 5. DNS record (proxied) ─────────────────────────────────────────
cyan "▶ 5. DNS: $EDGE_HOSTNAME (proxied)"
EXISTING_DNS=$(curl -fsS \
  "$CF_API/zones/$ZONE_ID/dns_records?name=$EDGE_HOSTNAME&type=AAAA" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[0].id // empty')
DNS_BODY=$(jq -nc --arg n "$EDGE_HOSTNAME" \
  '{type:"AAAA", name:$n, content:"100::", ttl:1, proxied:true}')
if [[ -z "$EXISTING_DNS" ]]; then
  curl -fsS -X POST "$CF_API/zones/$ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" -d "$DNS_BODY" >/dev/null
  green "  created"
else
  curl -fsS -X PATCH "$CF_API/zones/$ZONE_ID/dns_records/$EXISTING_DNS" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" -d "$DNS_BODY" >/dev/null
  green "  updated"
fi
echo

# ─── 6. Deploy backend worker ────────────────────────────────────────
cyan "▶ 6. Deploy $EDGE_SERV_SCRIPT (backend)"
( cd "$SERV_DIR" \
  && ./node_modules/.bin/tsc \
  && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
     ./node_modules/.bin/wrangler deploy --config wrangler.edge.toml >/dev/null )
green "  deployed"
echo

# ─── 7. Register routes via API (deterministic) ──────────────────────
# wrangler can silently fail to register routes when another worker
# already holds a wider pattern on the same host; the API call surfaces
# any error explicitly.
cyan "▶ 7. Register worker routes"
register_route() {
  local pattern="$1" script="$2" existing
  existing=$(curl -fsS "$CF_API/zones/$ZONE_ID/workers/routes" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    | jq -r --arg p "$pattern" '.result[] | select(.pattern==$p) | .id' | head -1)
  if [[ -n "$existing" ]]; then
    curl -fsS -X PUT "$CF_API/zones/$ZONE_ID/workers/routes/$existing" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -nc --arg p "$pattern" --arg s "$script" '{pattern:$p, script:$s}')" \
      >/dev/null
    printf "  updated  %-40s → %s\n" "$pattern" "$script"
  else
    curl -fsS -X POST "$CF_API/zones/$ZONE_ID/workers/routes" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$(jq -nc --arg p "$pattern" --arg s "$script" '{pattern:$p, script:$s}')" \
      >/dev/null
    printf "  created  %-40s → %s\n" "$pattern" "$script"
  fi
}
for p in "${SERV_PATHS[@]}"; do
  register_route "$EDGE_HOSTNAME$p" "$EDGE_SERV_SCRIPT"
done
register_route "$EDGE_HOSTNAME/*" "$EDGE_WEB_SCRIPT"
echo

# ─── 8. Secrets (synced across both workers) ─────────────────────────
cyan "▶ 8. Secrets"
AUTH_SECRET=$(openssl rand -hex 32)
ADMIN_SECRET=$(openssl rand -hex 32)

put_secret() {
  local name="$1" value="$2" config="$3" cwd="$4"
  ( cd "$cwd" && printf '%s' "$value" \
    | CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
      ./node_modules/.bin/wrangler secret put "$name" --config "$config" \
      >/dev/null 2>&1 )
}
put_secret HUOZI_AUTH_SECRET  "$AUTH_SECRET"  wrangler.edge.toml "$SERV_DIR"
put_secret HUOZI_ADMIN_SECRET "$ADMIN_SECRET" wrangler.edge.toml "$SERV_DIR"
green "  serv worker secrets set"
echo

# ─── 9. Build + deploy BFF (OpenNext) ────────────────────────────────
cyan "▶ 9. Build + deploy $EDGE_WEB_SCRIPT (BFF)"
( cd "$ROOT_DIR" \
  && HUOZI_EDITION=edge \
     CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
     npx --yes @opennextjs/cloudflare build >/dev/null \
  && HUOZI_EDITION=edge \
     CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
     npx --yes @opennextjs/cloudflare deploy \
       --config=wrangler.edge.jsonc >/dev/null )
put_secret HUOZI_AUTH_SECRET  "$AUTH_SECRET"  wrangler.edge.jsonc "$ROOT_DIR"
put_secret HUOZI_ADMIN_SECRET "$ADMIN_SECRET" wrangler.edge.jsonc "$ROOT_DIR"
green "  deployed + secrets set"
echo

# ─── 10. Smoke ───────────────────────────────────────────────────────
cyan "▶ 10. Smoke test"
sleep 4 # propagation
status=$(curl -s -o /dev/null -w '%{http_code}' "https://$EDGE_HOSTNAME/health" || echo 000)
[[ "$status" == "200" ]] && green "  /health → 200" \
  || yellow "  /health → $status (DNS may still be propagating; try again in 30s)"
status=$(curl -s -o /dev/null -w '%{http_code}' "https://$EDGE_HOSTNAME/login" || echo 000)
[[ "$status" == "200" ]] && green "  /login  → 200" \
  || yellow "  /login  → $status"
echo

# ─── Done ────────────────────────────────────────────────────────────
green "✓ Edge demo deployed."
echo
cyan  "Open this URL in a browser to set up the first admin:"
echo "  https://$EDGE_HOSTNAME/admin/setup?secret=$ADMIN_SECRET"
echo
yellow "After admin setup the page 404s (one-shot guard); discard the URL."

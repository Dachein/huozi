#!/usr/bin/env bash
#
# scripts/edge-deploy.sh
#
# huozi Edge — one-shot interactive deploy.
#
# Provisions huozi-edge-{web,serv}-demo on a Cloudflare account,
# fronted by edge.huozi.app (or any hostname you set). Idempotent —
# re-runs pick up where last attempt failed.
#
# Tool split (after iterating on what actually works):
#   ✓ Direct CF API: D1, R2, DNS, routes, secrets, token refresh
#   ✓ wrangler:      worker upload only (handles tsc + esbuild + DOs +
#                    Wasm rules + multipart packaging)
#   ✓ OpenNext:      BFF build (Next.js → .open-next/worker.js)
#
# Auth: relies on `cf` CLI's OAuth (no raw API token needed). Run
# `npx cf auth login` once before the first deploy.
#
# Usage:
#   pnpm edge:provision                        # interactive, default settings
#   EDGE_HOSTNAME=foo.example.com pnpm edge:provision   # override host
#

set -euo pipefail

# ── Constants ───────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERV_DIR="$ROOT_DIR/packages/huozi-cloud"
CF_API="https://api.cloudflare.com/client/v4"
CF_OAUTH_TOKEN_URL="https://dash.cloudflare.com/oauth2/token"
CF_OAUTH_CLIENT_ID="cbca97e7-c331-4cdd-8fd8-e25a451b98bf"
CF_CONFIG="$HOME/.cf/config.toml"

EDGE_HOSTNAME="${EDGE_HOSTNAME:-edge.huozi.app}"
EDGE_ZONE="${EDGE_ZONE:-huozi.app}"
EDGE_WS_SLUG="${EDGE_WORKSPACE_SLUG:-demo}"
EDGE_WS_NAME="${EDGE_WORKSPACE_NAME:-Edge Demo}"
EDGE_SERV="${EDGE_SERV_SCRIPT:-huozi-edge-serv-demo}"
EDGE_WEB="${EDGE_WEB_SCRIPT:-huozi-edge-web-demo}"
EDGE_D1="${EDGE_D1_NAME:-huozi-edge-db}"
EDGE_R2="${EDGE_R2_NAME:-huozi-edge-blobs}"

SERV_PATHS=(
  "/auth/*" "/admin/*" "/me/*" "/mcp"
  "/events/*" "/shares" "/shares/*"
  "/blobs/*" "/health" "/debug/*"
)

# ── Output helpers ──────────────────────────────────────────────────
step()  { printf "\n\033[36m▶ %s\033[0m\n" "$*"; }
ok()    { printf "  \033[32m✓\033[0m %s\n" "$*"; }
info()  { printf "  · %s\n" "$*"; }
warn()  { printf "  \033[33m▲\033[0m %s\n" "$*"; }
fail()  { printf "  \033[31m✘\033[0m %s\n" "$*" >&2; }
die()   { fail "$*"; exit 1; }

# ── Token management (single source of truth) ───────────────────────
TOKEN=""

# Read access_token from cf CLI's config file. Empty if missing/file gone.
read_token_from_config() {
  python3 -c "
import re, sys
try:
    with open('$CF_CONFIG') as f:
        m = re.search(r'access_token\s*=\s*\"([^\"]+)\"', f.read())
    print(m.group(1) if m else '')
except FileNotFoundError:
    pass"
}

# Same for refresh_token.
read_refresh_from_config() {
  python3 -c "
import re, sys
try:
    with open('$CF_CONFIG') as f:
        m = re.search(r'refresh_token\s*=\s*\"([^\"]+)\"', f.read())
    print(m.group(1) if m else '')
except FileNotFoundError:
    pass"
}

# Exchange refresh_token for new access_token, persist to config.
# Returns 0 on success, 1 if refresh failed.
refresh_token() {
  local rt resp
  rt=$(read_refresh_from_config)
  [[ -n "$rt" ]] || return 1

  resp=$(curl -sS -X POST "$CF_OAUTH_TOKEN_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=refresh_token&refresh_token=$rt&client_id=$CF_OAUTH_CLIENT_ID")

  CF_RESP="$resp" python3 << 'PYEOF' || return 1
import os, json, re
from datetime import datetime, timedelta, timezone
resp = json.loads(os.environ['CF_RESP'])
if 'access_token' not in resp:
    raise SystemExit(1)
at = resp['access_token']
rt = resp.get('refresh_token', '')
exp = (datetime.now(timezone.utc) + timedelta(seconds=resp.get('expires_in', 3600) - 60)).isoformat().replace('+00:00','Z')
p = os.path.expanduser('~/.cf/config.toml')
with open(p) as f:
    c = f.read()
c = re.sub(r'access_token\s*=\s*"[^"]+"', 'access_token = "' + at + '"', c)
if rt:
    c = re.sub(r'refresh_token\s*=\s*"[^"]+"', 'refresh_token = "' + rt + '"', c)
c = re.sub(r'expires_at\s*=\s*"[^"]+"', 'expires_at = "' + exp + '"', c)
with open(p, 'w') as f:
    f.write(c)
PYEOF
}

# Lazy-load + verify token. Two sources, in order:
#   1. $CLOUDFLARE_API_TOKEN env var (CI/GitHub Actions path; long-lived
#      scoped token from CF dashboard, no OAuth dance)
#   2. cf CLI's ~/.cf/config.toml access_token (local dev path; short-
#      lived OAuth, auto-refreshed via refresh_token)
ensure_token() {
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] && [[ ! -f "$CF_CONFIG" ]]; then
    # CI mode: env var is authoritative, no refresh fallback (long-lived).
    TOKEN="$CLOUDFLARE_API_TOKEN"
    local probe
    probe=$(curl -sS "$CF_API/accounts" -H "Authorization: Bearer $TOKEN" \
      | jq -r '.success // false')
    [[ "$probe" == "true" ]] || die "CLOUDFLARE_API_TOKEN rejected by CF API"
    return 0
  fi

  TOKEN=$(read_token_from_config)
  [[ -n "$TOKEN" ]] || die "No token: set CLOUDFLARE_API_TOKEN or run \`npx cf auth login\`"

  local probe
  probe=$(curl -sS "$CF_API/accounts" -H "Authorization: Bearer $TOKEN" \
    | jq -r '.success // false')
  if [[ "$probe" == "true" ]]; then
    return 0
  fi

  warn "token expired; refreshing..."
  if refresh_token; then
    TOKEN=$(read_token_from_config)
    probe=$(curl -sS "$CF_API/accounts" -H "Authorization: Bearer $TOKEN" \
      | jq -r '.success // false')
    [[ "$probe" == "true" ]] && { ok "token refreshed"; return 0; }
  fi
  die "Token refresh failed. Run: npx cf auth login --force"
}

# Wrap a curl call with auto-refresh on 401 (one retry).
api() {
  local method="$1"; shift
  local path="$1";   shift
  local body="${1:-}"
  local args=(-sS -X "$method" "$CF_API$path" -H "Authorization: Bearer $TOKEN")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi
  local resp http
  resp=$(curl "${args[@]}" -w "\n___HTTP___%{http_code}" || echo "")
  http=$(echo "$resp" | sed -n 's/___HTTP___\(.*\)/\1/p')
  resp=$(echo "$resp" | sed '/___HTTP___/d')
  if [[ "$http" == "401" ]]; then
    warn "401 — refreshing token + retry"
    refresh_token || die "auto-refresh failed; run: npx cf auth login --force"
    TOKEN=$(read_token_from_config)
    args[5]="Authorization: Bearer $TOKEN"
    resp=$(curl "${args[@]}" -w "\n___HTTP___%{http_code}" || echo "")
    http=$(echo "$resp" | sed -n 's/___HTTP___\(.*\)/\1/p')
    resp=$(echo "$resp" | sed '/___HTTP___/d')
  fi
  echo "$resp"
}

# ── 0. Pre-flight ───────────────────────────────────────────────────
phase_preflight() {
  step "Pre-flight"
  for tool in jq curl openssl python3 npx node; do
    command -v "$tool" >/dev/null || die "$tool not found"
  done
  ok "tools present (jq, curl, openssl, python3, npx, node)"

  ensure_token

  ACCOUNT_ID=$(api GET /accounts | jq -r '.result[0].id')
  [[ -n "$ACCOUNT_ID" && "$ACCOUNT_ID" != "null" ]] \
    || die "Couldn't read account ID"
  ZONE_ID=$(api GET "/zones?name=$EDGE_ZONE" | jq -r '.result[0].id // empty')
  [[ -n "$ZONE_ID" ]] || die "Zone $EDGE_ZONE not found in this account"
  ok "account=$ACCOUNT_ID  zone=$EDGE_ZONE ($ZONE_ID)"

  echo
  printf "  Hostname:  %s\n" "$EDGE_HOSTNAME"
  printf "  Workspace: %s (%s)\n" "$EDGE_WS_NAME" "$EDGE_WS_SLUG"
  printf "  Backend:   %s\n" "$EDGE_SERV"
  printf "  BFF:       %s\n" "$EDGE_WEB"
  echo
}

# ── 1. D1 database ──────────────────────────────────────────────────
phase_d1() {
  step "1/9  D1 database — $EDGE_D1"
  D1_ID=$(api GET "/accounts/$ACCOUNT_ID/d1/database?name=$EDGE_D1" \
    | jq -r '.result[0].uuid // empty')
  if [[ -z "$D1_ID" ]]; then
    D1_ID=$(api POST "/accounts/$ACCOUNT_ID/d1/database" \
      "{\"name\":\"$EDGE_D1\"}" | jq -r '.result.uuid // empty')
    [[ -n "$D1_ID" ]] || die "D1 create failed"
    ok "created  → $D1_ID"
  else
    ok "reused   → $D1_ID"
  fi
}

# ── 2. R2 bucket ────────────────────────────────────────────────────
phase_r2() {
  step "2/9  R2 bucket — $EDGE_R2"
  local exists
  exists=$(api GET "/accounts/$ACCOUNT_ID/r2/buckets/$EDGE_R2" \
    | jq -r '.success // false')
  if [[ "$exists" != "true" ]]; then
    local resp
    resp=$(api POST "/accounts/$ACCOUNT_ID/r2/buckets" "{\"name\":\"$EDGE_R2\"}")
    [[ "$(echo "$resp" | jq -r '.success')" == "true" ]] \
      || die "R2 create failed: $(echo "$resp" | jq -c '.errors')"
    ok "created"
  else
    ok "reused"
  fi
}

# ── 3. Wrangler config files ────────────────────────────────────────
phase_configs() {
  step "3/9  Generate wrangler configs"
  local routes=""
  for p in "${SERV_PATHS[@]}"; do
    routes+="  { pattern = \"$EDGE_HOSTNAME$p\", zone_name = \"$EDGE_ZONE\" },"$'\n'
  done
  cat > "$SERV_DIR/wrangler.edge.toml" <<EOF
# Auto-generated by scripts/edge-deploy.sh — do not edit by hand.
name = "$EDGE_SERV"
main = "dist/worker/index.js"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

[[rules]]
type = "CompiledWasm"
globs = ["**/*.wasm"]
fallthrough = true

routes = [
$routes]

[vars]
HUOZI_PUBLIC_BASE = "https://$EDGE_HOSTNAME"
HUOZI_EDGE_WORKSPACE_SLUG = "$EDGE_WS_SLUG"
HUOZI_EDGE_WORKSPACE_NAME = "$EDGE_WS_NAME"

[[r2_buckets]]
binding = "BLOBS"
bucket_name = "$EDGE_R2"

[[d1_databases]]
binding = "DB"
database_name = "$EDGE_D1"
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

  cat > "$ROOT_DIR/wrangler.edge.jsonc" <<EOF
{
  "\$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "$EDGE_WEB",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "workers_dev": true,
  "routes": [
    { "pattern": "$EDGE_HOSTNAME/*", "zone_name": "$EDGE_ZONE" }
  ],
  "services": [
    { "binding": "CLOUD", "service": "$EDGE_SERV" }
  ],
  "vars": {
    "HUOZI_EDITION": "edge",
    "HUOZI_EDGE_WORKSPACE_SLUG": "$EDGE_WS_SLUG",
    "HUOZI_EDGE_WORKSPACE_NAME": "$EDGE_WS_NAME",
    "HUOZI_PUBLIC_BASE": "https://$EDGE_HOSTNAME"
  }
}
EOF
  ok "wrangler.edge.toml + wrangler.edge.jsonc"
}

# ── 4. D1 schema (wrangler — only step that still uses wrangler beyond
#       worker upload, because D1's `/raw` endpoint is single-statement
#       and our schema.sql has 30+ CREATE TABLE / CREATE INDEX. wrangler
#       d1 execute --file handles the batching for us) ────────────────
phase_schema() {
  step "4/9  Apply D1 schema (wrangler — multi-statement handled by it)"
  ( cd "$SERV_DIR" && CLOUDFLARE_API_TOKEN="$TOKEN" \
    ./node_modules/.bin/wrangler d1 execute "$EDGE_D1" \
      --file src/storage/cloudflare/schema.sql --remote \
      --config wrangler.edge.toml >/dev/null 2>&1 ) \
    || die "schema apply failed"
  ok "schema applied"
}

# ── 5. DNS record (proxied) ─────────────────────────────────────────
phase_dns() {
  step "5/9  DNS — $EDGE_HOSTNAME (proxied)"
  local existing body resp ok_field
  existing=$(api GET "/zones/$ZONE_ID/dns_records?name=$EDGE_HOSTNAME&type=AAAA" \
    | jq -r '.result[0].id // empty')
  body=$(jq -nc --arg n "$EDGE_HOSTNAME" \
    '{type:"AAAA", name:$n, content:"100::", ttl:1, proxied:true}')
  if [[ -n "$existing" ]]; then
    resp=$(api PATCH "/zones/$ZONE_ID/dns_records/$existing" "$body")
    ok_field=$(echo "$resp" | jq -r '.success')
    [[ "$ok_field" == "true" ]] || die "DNS update failed: $(echo "$resp" | jq -c '.errors')"
    ok "updated"
  else
    resp=$(api POST "/zones/$ZONE_ID/dns_records" "$body")
    ok_field=$(echo "$resp" | jq -r '.success')
    [[ "$ok_field" == "true" ]] || die "DNS create failed: $(echo "$resp" | jq -c '.errors')"
    ok "created"
  fi
}

# ── 6. Backend worker (wrangler) ────────────────────────────────────
phase_serv_deploy() {
  step "6/9  Deploy backend worker — $EDGE_SERV"
  ( cd "$SERV_DIR" \
    && CLOUDFLARE_API_TOKEN="$TOKEN" ./node_modules/.bin/tsc \
    && CLOUDFLARE_API_TOKEN="$TOKEN" ./node_modules/.bin/wrangler deploy \
       --config wrangler.edge.toml >/dev/null )
  ok "deployed"
}

# ── 7. Backend routes (direct API, with throttle) ───────────────────
register_route() {
  local pattern="$1" script_name="$2"
  local body resp ok_field code msg
  body=$(jq -nc --arg p "$pattern" --arg s "$script_name" '{pattern:$p, script:$s}')

  for attempt in 1 2 3; do
    local existing
    existing=$(api GET "/zones/$ZONE_ID/workers/routes" \
      | jq -r --arg p "$pattern" '.result[]? | select(.pattern==$p) | .id' | head -1)
    if [[ -n "$existing" ]]; then
      resp=$(api PUT "/zones/$ZONE_ID/workers/routes/$existing" "$body")
    else
      resp=$(api POST "/zones/$ZONE_ID/workers/routes" "$body")
    fi
    ok_field=$(echo "$resp" | jq -r '.success // false')
    if [[ "$ok_field" == "true" ]]; then
      printf "  \033[32m✓\033[0m %-40s → %s\n" "$pattern" "$script_name"
      return 0
    fi
    code=$(echo "$resp" | jq -r '.errors[0].code // 0')
    msg=$(echo "$resp" | jq -r '.errors[0].message // ""')
    if [[ "$code" == "10429" ]]; then
      warn "rate-limited on $pattern (attempt $attempt) — sleeping 30s"
      sleep 30
      continue
    fi
    fail "$pattern  code=$code  msg=${msg:0:80}"
    return 1
  done
  die "gave up registering $pattern after retries"
}

phase_serv_routes() {
  step "7/9  Backend routes (10 paths, 2s spacing)"
  for p in "${SERV_PATHS[@]}"; do
    register_route "$EDGE_HOSTNAME$p" "$EDGE_SERV"
    sleep 2
  done
}

# ── 8. Secrets (direct API, faster than wrangler secret put) ────────
put_secret_api() {
  local script_name="$1" secret_name="$2" secret_value="$3"
  local body resp ok_field
  body=$(jq -nc \
    --arg n "$secret_name" \
    --arg t "$secret_value" \
    '{name:$n, text:$t, type:"secret_text"}')
  resp=$(api PUT "/accounts/$ACCOUNT_ID/workers/scripts/$script_name/secrets" "$body")
  ok_field=$(echo "$resp" | jq -r '.success // false')
  [[ "$ok_field" == "true" ]] \
    || die "secret put failed ($script_name.$secret_name): $(echo "$resp" | jq -c '.errors')"
  printf "  \033[32m✓\033[0m %s.%s\n" "$script_name" "$secret_name"
}

phase_secrets() {
  step "8/9  Secrets (synced across both workers)"
  AUTH_SECRET=$(openssl rand -hex 32)
  ADMIN_SECRET=$(openssl rand -hex 32)
  # Persist for the final URL print + manual recovery.
  mkdir -p /tmp/huozi-edge-tmp && chmod 700 /tmp/huozi-edge-tmp
  printf '%s' "$ADMIN_SECRET" > /tmp/huozi-edge-tmp/admin
  printf '%s' "$AUTH_SECRET"  > /tmp/huozi-edge-tmp/auth
  chmod 600 /tmp/huozi-edge-tmp/admin /tmp/huozi-edge-tmp/auth

  put_secret_api "$EDGE_SERV" HUOZI_AUTH_SECRET  "$AUTH_SECRET"
  put_secret_api "$EDGE_SERV" HUOZI_ADMIN_SECRET "$ADMIN_SECRET"
}

# ── 9. BFF: build, deploy, secrets, catch-all route ─────────────────
# This phase is the longest (build ~30s, upload ~3-5min). Token can
# expire mid-upload, so we refresh just before invoking wrangler. The
# fresh token typically buys 1 hour, plenty for the upload.
phase_bff() {
  step "9/9  BFF — $EDGE_WEB (build + deploy + secrets + catch-all)"

  info "OpenNext build (webpack mode — fonts.gstatic.com tolerant)"
  ( cd "$ROOT_DIR" \
    && NEXT_DISABLE_TURBOPACK=1 HUOZI_EDITION=edge \
       npx --yes @opennextjs/cloudflare build >/dev/null 2>&1 )
  ok "built"

  info "refreshing token before upload"
  refresh_token >/dev/null 2>&1 || true
  TOKEN=$(read_token_from_config)
  ok "token refreshed"

  info "wrangler upload (with retry on network blip)"
  local upload_log="/tmp/huozi-edge-tmp/last-upload.log"
  mkdir -p /tmp/huozi-edge-tmp
  for attempt in 1 2 3; do
    if ( cd "$ROOT_DIR" \
         && CLOUDFLARE_API_TOKEN="$TOKEN" HUOZI_EDITION=edge \
            npx --yes @opennextjs/cloudflare deploy --config=wrangler.edge.jsonc \
            >"$upload_log" 2>&1 ); then
      break
    fi
    if grep -qE "fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN" "$upload_log"; then
      warn "upload network blip (attempt $attempt) — retrying in 10s"
      sleep 10
      # Refresh token in case it expired during retry
      refresh_token >/dev/null 2>&1 || true
      TOKEN=$(read_token_from_config)
      continue
    fi
    fail "BFF upload failed:"
    tail -20 "$upload_log" >&2
    die "see $upload_log"
  done
  ok "deployed"

  put_secret_api "$EDGE_WEB" HUOZI_AUTH_SECRET  "$AUTH_SECRET"
  put_secret_api "$EDGE_WEB" HUOZI_ADMIN_SECRET "$ADMIN_SECRET"

  info "catch-all route"
  register_route "$EDGE_HOSTNAME/*" "$EDGE_WEB"
}

# ── Smoke + final URL ───────────────────────────────────────────────
phase_smoke() {
  step "Smoke (after 5s propagation)"
  sleep 5
  local h l a
  h=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$EDGE_HOSTNAME/health")
  l=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$EDGE_HOSTNAME/login")
  a=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$EDGE_HOSTNAME/admin/setup?secret=$ADMIN_SECRET")
  printf "  /health:       %s %s\n" "$h" "$([[ $h == 200 ]] && echo ✓ || echo ⚠)"
  printf "  /login:        %s %s\n" "$l" "$([[ $l == 200 ]] && echo ✓ || echo ⚠)"
  printf "  /admin/setup:  %s %s\n" "$a" "$([[ $a == 200 ]] && echo ✓ || echo ⚠)"
  if [[ "$a" != "200" ]]; then
    warn "admin/setup not 200 — DNS may still be propagating; try opening the URL in 30-60s"
  fi
}

phase_done() {
  local setup_url="https://$EDGE_HOSTNAME/admin/setup?secret=$ADMIN_SECRET"

  echo
  echo "════════════════════════════════════════════════════════════"
  echo "  ✓ Edge demo deployed."
  echo
  echo "  Open this URL in a browser to set up the first admin:"
  echo
  echo "    $setup_url"
  echo
  echo "  After admin setup the URL self-disables (one-shot guard)."
  echo "  Subsequent sign-ins go through https://$EDGE_HOSTNAME/login"
  echo "════════════════════════════════════════════════════════════"

  # When running under GitHub Actions, expose the setup URL as a job
  # output so subsequent steps can surface it in the workflow log.
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "setup_url=$setup_url" >> "$GITHUB_OUTPUT"
  fi
}

# ── Drive ───────────────────────────────────────────────────────────
phase_preflight
phase_d1
phase_r2
phase_configs
phase_schema
phase_dns
phase_serv_deploy
phase_serv_routes
phase_secrets
phase_bff
phase_smoke
phase_done

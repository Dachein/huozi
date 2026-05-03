#!/usr/bin/env bash
#
# scripts/edge-teardown.sh
#
# Hard wipe of the Edge demo deployment. Direct CF API only — no
# wrangler subprocess, no buffering surprises. Typical run < 30s.
#
# Removes:
#   - Worker scripts huozi-edge-{web,serv}-demo
#   - Worker routes for edge.huozi.app/*
#   - DNS records for edge.huozi.app
#   - D1 database huozi-edge-db (data lost!)
#   - R2 bucket huozi-edge-blobs (objects lost, then bucket)
#   - Local artifacts: wrangler.edge.toml, wrangler.edge.jsonc,
#     /tmp/huozi-edge-tmp/{auth,admin}
#
# Auth: same cf CLI OAuth token as edge-deploy.sh. Auto-refreshes if
# expired. Run `npx cf auth login` once if you've never logged in.
#
# Usage:
#   pnpm edge:teardown
#

set -euo pipefail

CF_API="https://api.cloudflare.com/client/v4"
CF_OAUTH_TOKEN_URL="https://dash.cloudflare.com/oauth2/token"
CF_OAUTH_CLIENT_ID="cbca97e7-c331-4cdd-8fd8-e25a451b98bf"
CF_CONFIG="$HOME/.cf/config.toml"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERV_DIR="$ROOT_DIR/packages/huozi-cloud"

EDGE_HOSTNAME="${EDGE_HOSTNAME:-edge.huozi.app}"
EDGE_ZONE="${EDGE_ZONE:-huozi.app}"
EDGE_SERV="${EDGE_SERV_SCRIPT:-huozi-edge-serv-demo}"
EDGE_WEB="${EDGE_WEB_SCRIPT:-huozi-edge-web-demo}"
EDGE_D1="${EDGE_D1_NAME:-huozi-edge-db}"
EDGE_R2="${EDGE_R2_NAME:-huozi-edge-blobs}"

ok()    { printf "  \033[32m✓\033[0m %s\n" "$*"; }
info()  { printf "  · %s\n" "$*"; }
warn()  { printf "  \033[33m▲\033[0m %s\n" "$*"; }
fail()  { printf "  \033[31m✘\033[0m %s\n" "$*" >&2; }
die()   { fail "$*"; exit 1; }

# ── Token (mirror edge-deploy.sh logic) ─────────────────────────────
read_token_from_config() {
  python3 -c "
import re
try:
    with open('$CF_CONFIG') as f:
        m = re.search(r'access_token\s*=\s*\"([^\"]+)\"', f.read())
    print(m.group(1) if m else '')
except FileNotFoundError:
    pass"
}

read_refresh_from_config() {
  python3 -c "
import re
try:
    with open('$CF_CONFIG') as f:
        m = re.search(r'refresh_token\s*=\s*\"([^\"]+)\"', f.read())
    print(m.group(1) if m else '')
except FileNotFoundError:
    pass"
}

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
rt = resp.get('refresh_token','')
exp = (datetime.now(timezone.utc) + timedelta(seconds=resp.get('expires_in',3600)-60)).isoformat().replace('+00:00','Z')
p = os.path.expanduser('~/.cf/config.toml')
c = open(p).read()
c = re.sub(r'access_token\s*=\s*"[^"]+"', 'access_token = "' + at + '"', c)
if rt: c = re.sub(r'refresh_token\s*=\s*"[^"]+"', 'refresh_token = "' + rt + '"', c)
c = re.sub(r'expires_at\s*=\s*"[^"]+"', 'expires_at = "' + exp + '"', c)
open(p, 'w').write(c)
PYEOF
}

ensure_token() {
  TOKEN=$(read_token_from_config)
  [[ -n "$TOKEN" ]] || die "No cf token. Run: npx cf auth login"
  local probe
  probe=$(curl -sS "$CF_API/accounts" -H "Authorization: Bearer $TOKEN" \
    | jq -r '.success // false')
  if [[ "$probe" == "true" ]]; then return 0; fi
  warn "token expired; refreshing..."
  refresh_token || die "refresh failed; run: npx cf auth login --force"
  TOKEN=$(read_token_from_config)
}

# ── Drive ───────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════"
echo "huozi Edge — hard wipe"
echo "  $EDGE_WEB / $EDGE_SERV / $EDGE_D1 / $EDGE_R2"
echo "════════════════════════════════════════════════════════════"

ensure_token

ACCOUNT_ID=$(curl -sS "$CF_API/accounts" -H "Authorization: Bearer $TOKEN" \
  | jq -r '.result[0].id')
ZONE_ID=$(curl -sS "$CF_API/zones?name=$EDGE_ZONE" -H "Authorization: Bearer $TOKEN" \
  | jq -r '.result[0].id // empty')
[[ -n "$ZONE_ID" ]] || die "Zone $EDGE_ZONE not found"
ok "auth ok  account=$ACCOUNT_ID  zone=$ZONE_ID"

# ── Workers ─────────────────────────────────────────────────────────
for name in "$EDGE_WEB" "$EDGE_SERV"; do
  resp=$(curl -sS -X DELETE "$CF_API/accounts/$ACCOUNT_ID/workers/scripts/$name" \
    -H "Authorization: Bearer $TOKEN")
  ok_v=$(echo "$resp" | jq -r '.success // false')
  if [[ "$ok_v" == "true" ]]; then
    ok "worker deleted   : $name"
  else
    code=$(echo "$resp" | jq -r '.errors[0].code // 0')
    if [[ "$code" == "10007" ]]; then
      info "worker absent    : $name"
    else
      fail "worker error     : $name → $resp"
    fi
  fi
done

# ── Routes ─────────────────────────────────────────────────────────
ROUTES=$(curl -sS "$CF_API/zones/$ZONE_ID/workers/routes" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r --arg h "$EDGE_HOSTNAME" \
      '.result[]? | select(.pattern | startswith($h)) | "\(.id) \(.pattern)"')
n=0
while IFS=' ' read -r id pattern; do
  [ -z "$id" ] && continue
  curl -sS -X DELETE "$CF_API/zones/$ZONE_ID/workers/routes/$id" \
    -H "Authorization: Bearer $TOKEN" >/dev/null
  ok "route deleted    : $pattern"
  n=$((n+1))
done <<< "$ROUTES"
[ $n -eq 0 ] && info "routes absent"

# ── DNS ────────────────────────────────────────────────────────────
DNS=$(curl -sS "$CF_API/zones/$ZONE_ID/dns_records?name=$EDGE_HOSTNAME" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.result[]? | "\(.id) \(.type) \(.name)"')
n=0
while IFS=' ' read -r id rtype name; do
  [ -z "$id" ] && continue
  curl -sS -X DELETE "$CF_API/zones/$ZONE_ID/dns_records/$id" \
    -H "Authorization: Bearer $TOKEN" >/dev/null
  ok "DNS deleted      : $rtype $name"
  n=$((n+1))
done <<< "$DNS"
[ $n -eq 0 ] && info "DNS absent"

# ── D1 ─────────────────────────────────────────────────────────────
D1_ID=$(curl -sS "$CF_API/accounts/$ACCOUNT_ID/d1/database?name=$EDGE_D1" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.result[0].uuid // empty')
if [[ -n "$D1_ID" ]]; then
  resp=$(curl -sS -X DELETE "$CF_API/accounts/$ACCOUNT_ID/d1/database/$D1_ID" \
    -H "Authorization: Bearer $TOKEN")
  ok_v=$(echo "$resp" | jq -r '.success // false')
  [[ "$ok_v" == "true" ]] && ok "D1 deleted       : $EDGE_D1 ($D1_ID)" \
    || fail "D1 delete error   : $resp"
else
  info "D1 absent"
fi

# ── R2 (empty objects first, then bucket) ──────────────────────────
R2_OK=$(curl -sS "$CF_API/accounts/$ACCOUNT_ID/r2/buckets/$EDGE_R2" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.success // false')
if [[ "$R2_OK" == "true" ]]; then
  obj_count=0
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    curl -sS -X DELETE \
      "$CF_API/accounts/$ACCOUNT_ID/r2/buckets/$EDGE_R2/objects/$key" \
      -H "Authorization: Bearer $TOKEN" >/dev/null
    obj_count=$((obj_count+1))
  done < <(curl -sS "$CF_API/accounts/$ACCOUNT_ID/r2/buckets/$EDGE_R2/objects" \
    -H "Authorization: Bearer $TOKEN" \
    | jq -r '.result[]?.key' 2>/dev/null || true)

  resp=$(curl -sS -X DELETE "$CF_API/accounts/$ACCOUNT_ID/r2/buckets/$EDGE_R2" \
    -H "Authorization: Bearer $TOKEN")
  ok_v=$(echo "$resp" | jq -r '.success // false')
  [[ "$ok_v" == "true" ]] \
    && ok "R2 deleted       : $EDGE_R2 (emptied $obj_count obj)" \
    || fail "R2 delete error   : $resp"
else
  info "R2 absent"
fi

# ── Local artifacts ────────────────────────────────────────────────
rm -rf /tmp/huozi-edge-tmp
rm -f "$SERV_DIR/wrangler.edge.toml" "$ROOT_DIR/wrangler.edge.jsonc"
ok "local artifacts removed"

echo
echo "════════════════════════════════════════════════════════════"
echo "  ✓ wipe complete"
echo "════════════════════════════════════════════════════════════"

#!/usr/bin/env bash
#
# scripts/edge-teardown.sh
#
# Removes the workers + DNS + routes provisioned by edge-deploy.sh.
# By default keeps D1 + R2 (data preservation); pass --hard to also
# delete the database and bucket. Generated wrangler config files are
# always removed.
#
# Idempotent: missing resources are ignored.
#
# Inputs (env vars, must match the deploy):
#   CLOUDFLARE_API_TOKEN     scopes: Workers Scripts:Edit, D1:Edit (--hard),
#                            R2:Edit (--hard), DNS:Edit, Workers Routes:Edit
#   EDGE_HOSTNAME            (default: edge.huozi.app)
#   EDGE_ZONE                (default: huozi.app)
#   EDGE_SERV_SCRIPT         (default: huozi-edge-serv-demo)
#   EDGE_WEB_SCRIPT          (default: huozi-edge-web-demo)
#   EDGE_D1_NAME             (default: huozi-edge-db, only used with --hard)
#   EDGE_R2_NAME             (default: huozi-edge-blobs, only used with --hard)
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERV_DIR="$ROOT_DIR/packages/huozi-cloud"

EDGE_HOSTNAME="${EDGE_HOSTNAME:-edge.huozi.app}"
EDGE_ZONE="${EDGE_ZONE:-huozi.app}"
EDGE_SERV_SCRIPT="${EDGE_SERV_SCRIPT:-huozi-edge-serv-demo}"
EDGE_WEB_SCRIPT="${EDGE_WEB_SCRIPT:-huozi-edge-web-demo}"
EDGE_D1_NAME="${EDGE_D1_NAME:-huozi-edge-db}"
EDGE_R2_NAME="${EDGE_R2_NAME:-huozi-edge-blobs}"
SERV_TOML="$SERV_DIR/wrangler.edge.toml"
WEB_JSONC="$ROOT_DIR/wrangler.edge.jsonc"

CF_API="https://api.cloudflare.com/client/v4"

HARD=false
for arg in "$@"; do
  case "$arg" in
    --hard) HARD=true ;;
    *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*" >&2; }
die()    { red "✘ $*"; exit 1; }

[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || die "Set CLOUDFLARE_API_TOKEN."

cyan "▶ Pre-flight"
ZONE_ID=$(curl -fsS "$CF_API/zones?name=$EDGE_ZONE" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[0].id // empty')
[[ -n "$ZONE_ID" ]] || die "Zone $EDGE_ZONE not found."
green "  zone=$EDGE_ZONE"
echo

yellow "Will remove:"
yellow "  Worker (BFF):     $EDGE_WEB_SCRIPT"
yellow "  Worker (backend): $EDGE_SERV_SCRIPT"
yellow "  DNS record:       $EDGE_HOSTNAME"
yellow "  Worker routes:    $EDGE_HOSTNAME/* and 10 path patterns"
yellow "  Local files:      $SERV_TOML, $WEB_JSONC"
if $HARD; then
  yellow "  D1 (--hard):      $EDGE_D1_NAME (DATA WILL BE LOST)"
  yellow "  R2 (--hard):      $EDGE_R2_NAME (BLOBS WILL BE LOST)"
fi
read -rp "Proceed? [y/N] " yn
case "$yn" in y|Y|yes|YES) ;; *) echo "aborted"; exit 1 ;; esac
echo

# ─── Worker routes ──────────────────────────────────────────────────
cyan "▶ Worker routes"
ROUTES=$(curl -fsS "$CF_API/zones/$ZONE_ID/workers/routes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r --arg h "$EDGE_HOSTNAME" \
      '.result[] | select(.pattern | startswith($h)) | "\(.id) \(.pattern)"')
if [[ -n "$ROUTES" ]]; then
  while read -r id pattern; do
    [[ -z "$id" ]] && continue
    curl -fsS -X DELETE "$CF_API/zones/$ZONE_ID/workers/routes/$id" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" >/dev/null
    printf "  deleted  %s\n" "$pattern"
  done <<< "$ROUTES"
else
  green "  none to delete"
fi
echo

# ─── BFF worker ─────────────────────────────────────────────────────
cyan "▶ Worker $EDGE_WEB_SCRIPT"
( cd "$ROOT_DIR" && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  npx --yes wrangler delete --name "$EDGE_WEB_SCRIPT" --force 2>&1 | tail -2 ) \
  || yellow "  not found (already deleted)"
echo

# ─── Backend worker ─────────────────────────────────────────────────
cyan "▶ Worker $EDGE_SERV_SCRIPT"
( cd "$SERV_DIR" && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  ./node_modules/.bin/wrangler delete --name "$EDGE_SERV_SCRIPT" --force 2>&1 | tail -2 ) \
  || yellow "  not found (already deleted)"
echo

# ─── DNS ────────────────────────────────────────────────────────────
cyan "▶ DNS $EDGE_HOSTNAME"
DNS_IDS=$(curl -fsS "$CF_API/zones/$ZONE_ID/dns_records?name=$EDGE_HOSTNAME" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq -r '.result[].id')
if [[ -n "$DNS_IDS" ]]; then
  while read -r id; do
    [[ -z "$id" ]] && continue
    curl -fsS -X DELETE "$CF_API/zones/$ZONE_ID/dns_records/$id" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" >/dev/null
    printf "  deleted  %s\n" "$id"
  done <<< "$DNS_IDS"
else
  green "  none to delete"
fi
echo

# ─── --hard: D1 + R2 ────────────────────────────────────────────────
if $HARD; then
  cyan "▶ D1 $EDGE_D1_NAME"
  ( cd "$SERV_DIR" && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
    ./node_modules/.bin/wrangler d1 delete "$EDGE_D1_NAME" --skip-confirmation 2>&1 | tail -2 ) \
    || yellow "  not found"
  echo

  cyan "▶ R2 $EDGE_R2_NAME"
  ( cd "$SERV_DIR" && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
    ./node_modules/.bin/wrangler r2 bucket delete "$EDGE_R2_NAME" 2>&1 | tail -2 ) \
    || yellow "  not found / not empty (manual cleanup may be needed)"
  echo
fi

# ─── Local files ────────────────────────────────────────────────────
cyan "▶ Local files"
rm -f "$SERV_TOML" "$WEB_JSONC"
green "  removed $SERV_TOML"
green "  removed $WEB_JSONC"
echo

green "✓ Teardown complete"
$HARD || yellow "  (D1/R2 preserved — pass --hard to delete those too)"

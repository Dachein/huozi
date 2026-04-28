#!/usr/bin/env bash
#
# scripts/edge-teardown.sh
#
# Removes everything provisioned by edge-deploy.sh: BOTH workers (cloud
# + main), the D1 database, the R2 bucket, the generated wrangler config
# files, and the .huozi-edge.env file.
#
# Idempotent: if a resource is already gone we just keep going.
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/packages/huozi-cloud"

CLOUD_WORKER_NAME="huozi-edge"
MAIN_WORKER_NAME="huozi-edge-app"
D1_NAME="huozi-edge-db"
R2_NAME="huozi-edge-blobs"
CLOUD_WRANGLER_TOML="$WORKER_DIR/wrangler.edge.toml"
MAIN_WRANGLER_JSONC="$ROOT_DIR/wrangler.edge.jsonc"
ENV_FILE="$ROOT_DIR/.huozi-edge.env"

cyan() { printf '\033[36m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

# Confirm before destroying — these are remote CF resources.
yellow "About to delete (CONFIRM with y):"
yellow "  Cloud worker: $CLOUD_WORKER_NAME"
yellow "  Main worker:  $MAIN_WORKER_NAME"
yellow "  D1:           $D1_NAME"
yellow "  R2:           $R2_NAME (incl. all objects)"
yellow "  Files:        $CLOUD_WRANGLER_TOML, $MAIN_WRANGLER_JSONC, $ENV_FILE"
read -rp "Proceed? [y/N] " yn
case "$yn" in
  y|Y|yes|YES) ;;
  *) echo "aborted"; exit 1 ;;
esac

# ── Delete main worker first (depends on cloud via service binding) ──────
cyan "▸ Deleting Main worker $MAIN_WORKER_NAME"
if [[ -f "$MAIN_WRANGLER_JSONC" ]]; then
  (cd "$ROOT_DIR" && npx wrangler delete --config "$MAIN_WRANGLER_JSONC" 2>&1 | tail -3) || true
else
  (cd "$ROOT_DIR" && npx wrangler delete --name "$MAIN_WORKER_NAME" 2>&1 | tail -3) || true
fi

cd "$WORKER_DIR"

# ── Delete cloud worker (and its DOs / cron) ─────────────────────────────
cyan "▸ Deleting Cloud worker $CLOUD_WORKER_NAME"
npx wrangler delete --name "$CLOUD_WORKER_NAME" 2>&1 | tail -3 || true

cyan "▸ Deleting D1 $D1_NAME"
npx wrangler d1 delete "$D1_NAME" --skip-confirmation 2>&1 | tail -3 || true

cyan "▸ Emptying + deleting R2 $R2_NAME"
npx wrangler r2 bucket delete "$R2_NAME" 2>&1 | tail -3 || true

cyan "▸ Removing local artifacts"
rm -f "$CLOUD_WRANGLER_TOML" "$MAIN_WRANGLER_JSONC" "$ENV_FILE"

green "✓ Teardown complete"

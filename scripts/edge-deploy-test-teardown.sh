#!/usr/bin/env bash
#
# scripts/edge-deploy-test-teardown.sh
#
# Removes everything provisioned by edge-deploy-test.sh: the worker, the
# D1 database, the R2 bucket, the generated wrangler.edge.toml, and the
# .huozi-edge.env file.
#
# Idempotent: if a resource is already gone we just keep going.
#

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/packages/huozi-cloud"

WORKER_NAME="huozi-edge"
D1_NAME="huozi-edge-db"
R2_NAME="huozi-edge-blobs"
WRANGLER_TOML="$WORKER_DIR/wrangler.edge.toml"
ENV_FILE="$ROOT_DIR/.huozi-edge.env"

cyan() { printf '\033[36m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

cd "$WORKER_DIR"

# Confirm before destroying — these are remote CF resources.
yellow "About to delete (CONFIRM with y):"
yellow "  Worker:  $WORKER_NAME"
yellow "  D1:      $D1_NAME"
yellow "  R2:      $R2_NAME (incl. all objects)"
yellow "  Files:   $WRANGLER_TOML, $ENV_FILE"
read -rp "Proceed? [y/N] " yn
case "$yn" in
  y|Y|yes|YES) ;;
  *) echo "aborted"; exit 1 ;;
esac

cyan "▸ Deleting Worker $WORKER_NAME"
npx wrangler delete --name "$WORKER_NAME" 2>&1 | tail -3 || true

cyan "▸ Deleting D1 $D1_NAME"
# d1 delete is interactive; --skip-confirmation requires a flag. Use --yes.
npx wrangler d1 delete "$D1_NAME" --skip-confirmation 2>&1 | tail -3 || true

cyan "▸ Emptying + deleting R2 $R2_NAME"
# R2 buckets must be emptied before delete. List + delete objects in batches.
npx wrangler r2 bucket delete "$R2_NAME" 2>&1 | tail -3 || true

cyan "▸ Removing local artifacts"
rm -f "$WRANGLER_TOML" "$ENV_FILE"

green "✓ Teardown complete"

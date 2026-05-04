#!/usr/bin/env bash
#
# scripts/edge-install.sh
#
# huozi Edge — one-shot install bootstrap.
#
# Curl-pipeable. Run from a fresh machine with just node ≥ 20 and a
# Cloudflare account; this script handles everything else.
#
# Usage:
#   bash <(curl -sSL https://huozi.app/install) --hostname edge.example.com
#
# Or directly from GitHub:
#   bash <(curl -sSL https://raw.githubusercontent.com/Dachein/huozi/main/scripts/edge-install.sh) \
#        --hostname edge.example.com
#
# Optional flags:
#   --hostname <host>             default: prompt
#   --zone <zone>                 default: derived from hostname (last 2 components)
#   --workspace-name <name>       default: "Edge Demo"
#   --workspace-slug <slug>       default: "demo"
#   --skip-cf-login               skip cf auth login (you've already logged in)
#

set -euo pipefail

# ─── Args ───────────────────────────────────────────────────────────
HOSTNAME=""
ZONE=""
WORKSPACE_NAME="Edge Demo"
WORKSPACE_SLUG="demo"
SKIP_CF_LOGIN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --hostname)        HOSTNAME="$2"; shift 2 ;;
    --zone)            ZONE="$2"; shift 2 ;;
    --workspace-name)  WORKSPACE_NAME="$2"; shift 2 ;;
    --workspace-slug)  WORKSPACE_SLUG="$2"; shift 2 ;;
    --skip-cf-login)   SKIP_CF_LOGIN=true; shift ;;
    -h|--help)
      sed -n '/^# Usage:/,/^# Optional flags/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ─── Output helpers ────────────────────────────────────────────────
say()    { printf "\n\033[36m▶ %s\033[0m\n" "$*"; }
ok()     { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn()   { printf "  \033[33m▲\033[0m %s\n" "$*"; }
fail()   { printf "  \033[31m✘\033[0m %s\n" "$*" >&2; }
die()    { fail "$*"; exit 1; }

# ─── Welcome banner ────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════"
echo "  huozi Edge — one-shot install"
echo "════════════════════════════════════════════════════════════"
echo
echo "  This will provision a self-host huozi Edge instance on your"
echo "  Cloudflare account. Roughly 5-10 minutes total."
echo

if [[ -z "$HOSTNAME" ]]; then
  printf "  Hostname (e.g. edge.example.com): "
  read -r HOSTNAME
fi

if [[ -z "$ZONE" ]]; then
  # Default: last two dotted components of hostname
  ZONE=$(echo "$HOSTNAME" | awk -F. '{
    n = NF
    if (n >= 2) print $(n-1) "." $n
    else print $0
  }')
fi

echo
echo "  Hostname:    $HOSTNAME"
echo "  Zone:        $ZONE"
echo "  Workspace:   $WORKSPACE_NAME ($WORKSPACE_SLUG)"
echo

# ─── Pre-flight: required tools ────────────────────────────────────
say "Checking prerequisites"

REQUIRED=(node npx jq curl openssl python3)
MISSING=()
for tool in "${REQUIRED[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    ok "$tool"
  else
    MISSING+=("$tool")
    fail "$tool not found"
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo
  echo "  Install the missing tools and re-run:"
  for t in "${MISSING[@]}"; do
    case "$t" in
      jq)       echo "    macOS:  brew install jq" ;;
      node|npx) echo "    Visit https://nodejs.org/ (need v20 or newer)" ;;
      python3)  echo "    macOS comes with python3; on Linux: apt install python3" ;;
      openssl)  echo "    macOS:  brew install openssl@3" ;;
    esac
  done
  exit 1
fi

# Node version check (wrangler 4.x needs ≥ 20)
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  die "Node v$NODE_MAJOR < v20 required. Update node and re-run."
fi
ok "node $(node --version)"

# ─── Cloudflare auth (cf CLI OAuth) ────────────────────────────────
if ! $SKIP_CF_LOGIN; then
  say "Cloudflare authentication"
  CF_VALID=$(npx --yes cf auth whoami 2>&1 \
    | grep -c '"tokenValid": true' || true)
  if [[ "$CF_VALID" == "0" ]]; then
    info_msg=$(cat <<'EOF'
  Not logged in to Cloudflare yet. Running OAuth flow now.
  Your browser will open. Click "Authorize" on the Cloudflare page,
  then come back here.
EOF
)
    echo "$info_msg"
    echo
    npx --yes cf auth login
  fi
  ok "cf authenticated"
fi

# ─── Fetch huozi source (tarball, no git required) ─────────────────
say "Fetching huozi source"
WORKDIR="$(mktemp -d -t huozi-edge-install-XXXX)"
trap "rm -rf '$WORKDIR'" EXIT

curl -sSL https://github.com/Dachein/huozi/archive/refs/heads/main.tar.gz \
  | tar xz -C "$WORKDIR" --strip-components=1
ok "extracted to $WORKDIR"

# ─── Install deps ──────────────────────────────────────────────────
# Use pnpm if available (faster), else npm. Either works for the
# scripts we're about to invoke.
say "Installing dependencies (~1-2 minutes)"

cd "$WORKDIR"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --silent --prefer-offline 2>&1 | tail -5
else
  npm install --silent --no-audit --no-fund --prefer-offline 2>&1 | tail -5
fi
ok "root deps"

cd "$WORKDIR/packages/huozi-cloud"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --silent --prefer-offline 2>&1 | tail -5
else
  npm install --silent --no-audit --no-fund --prefer-offline 2>&1 | tail -5
fi
ok "huozi-cloud deps"
cd "$WORKDIR"

# ─── Hand off to edge-deploy.sh ────────────────────────────────────
say "Running deploy (this is the long part — 5-7 minutes)"
echo

EDGE_HOSTNAME="$HOSTNAME" \
  EDGE_ZONE="$ZONE" \
  EDGE_WORKSPACE_NAME="$WORKSPACE_NAME" \
  EDGE_WORKSPACE_SLUG="$WORKSPACE_SLUG" \
  bash "$WORKDIR/scripts/edge-deploy.sh"

# ─── Final guidance ────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════════"
echo "  ✓ Install complete."
echo
echo "  Next steps:"
echo "    1. Open the setup URL above in your browser."
echo "    2. Set the first admin email + password."
echo "    3. Land on /workspace — top banner shows the connection"
echo "       snippet to paste into your Claude Code / Cursor MCP"
echo "       config."
echo "    4. Restart your AI client. 16 huozi tools become available."
echo "════════════════════════════════════════════════════════════"

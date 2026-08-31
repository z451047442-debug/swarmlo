#!/bin/bash
# =============================================================================
# Package as RVF (RuVector Format) distributable
# Creates a self-contained .rvf archive with manifest and all deployment files.
#
# Usage: bash scripts/package-rvf.sh [version]
# Output: dist/chat-ui-mcp-v{VERSION}.rvf
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Locate the swarmlo package root (the directory holding rvf.manifest.json) ---
ROOT_DIR="$SCRIPT_DIR"
while [ ! -f "$ROOT_DIR/rvf.manifest.json" ] && [ "$ROOT_DIR" != "/" ] && [ "$ROOT_DIR" != "." ]; do
  ROOT_DIR="$(dirname "$ROOT_DIR")"
done

if [ ! -f "$ROOT_DIR/rvf.manifest.json" ]; then
  echo "ERROR: rvf.manifest.json not found above $SCRIPT_DIR — run from the swarmlo package checkout." >&2
  exit 1
fi
cd "$ROOT_DIR"

VERSION="${1:-2.0.0}"
RVF_UUID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null || cat /proc/sys/kernel/random/uuid)
RVF_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Packaging chat-ui-mcp v${VERSION} as RVF..."

# --- Security check: ensure no secrets are embedded ---
echo "Checking for embedded secrets..."
SECRETS_FOUND=0

# Check for common API key patterns
for pattern in "AIzaSy" "sk-" "GOCSPX-" "ghp_" "glpat-" "xoxb-" "xoxp-"; do
  MATCHES=$(grep -r "$pattern" \
    --include="*.js" --include="*.json" --include="*.yaml" --include="*.yml" \
    --include="*.txt" \
    -l "$ROOT_DIR" 2>/dev/null | grep -v node_modules | grep -v ".env.example" | grep -v "README.md" | grep -v "docs/" | grep -v "package-rvf.sh" || true)
  if [ -n "$MATCHES" ]; then
    echo "WARNING: Possible secret pattern '$pattern' found in:"
    echo "$MATCHES"
    SECRETS_FOUND=1
  fi
done

if [ "$SECRETS_FOUND" -eq 1 ]; then
  echo ""
  echo "ERROR: Potential secrets detected. Remove all API keys before packaging."
  echo "All secrets must be provided via environment variables at deploy time."
  exit 1
fi

echo "No embedded secrets found."

# --- Create dist directory ---
mkdir -p dist

# --- Verify all files to be packaged exist (friendly error instead of bare set -e failure) ---
PACK_FILES=(
  rvf.manifest.json
  README.md
  .env.example
  docker-compose.yml
  src/config/config.example.json
  src/mcp-bridge/index.js
  src/mcp-bridge/package.json
  src/mcp-bridge/Dockerfile
  src/mcp-bridge/mcp-stdio-kernel.js
  src/mcp-bridge/test-harness.js
  src/chat-ui/Dockerfile
  src/chat-ui/patch-mcp-url-safety.sh
  src/chat-ui/static/
  src/scripts/deploy.sh
  src/scripts/generate-config.js
  src/scripts/generate-welcome.js
  src/scripts/package-rvf.sh
  docs/
)

MISSING=()
for f in "${PACK_FILES[@]}"; do
  if [ ! -e "$f" ]; then
    MISSING+=("$f")
  fi
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: Cannot package — missing required files:" >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  exit 1
fi

# --- Generate RVF manifest with actual UUID and timestamp ---
MANIFEST=$(cat rvf.manifest.json | \
  sed "s/\${RVF_UUID}/$RVF_UUID/g" | \
  sed "s/\${RVF_TIMESTAMP}/$RVF_TIMESTAMP/g" | \
  python3 -c "import json,sys; m=json.load(sys.stdin); m['version']='$VERSION'; json.dump(m,sys.stdout,indent=2)")

echo "$MANIFEST" > dist/rvf.manifest.json

# --- Create archive ---
OUTPUT="dist/chat-ui-mcp-v${VERSION}.rvf"

tar czf "$OUTPUT" \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='config/config.json' \
  --exclude='chat-ui/dotenv-local.txt' \
  --exclude='chat-ui/cloudbuild.yaml' \
  --exclude='mcp-bridge/cloudbuild.yaml' \
  --exclude='mcp-bridge/package-lock.json' \
  --exclude='dist' \
  --exclude='.git' \
  --transform="s|^src/||" \
  --transform="s|^|chat-ui-mcp/|" \
  -C "$ROOT_DIR" \
  "${PACK_FILES[@]}"

# --- Append manifest as RVF header ---
# RVF files are tar.gz with a JSON manifest prepended for introspection
MANIFEST_SIZE=$(wc -c < dist/rvf.manifest.json)
FINAL_OUTPUT="dist/chat-ui-mcp-v${VERSION}.rvf"

echo ""
echo "============================================"
echo "RVF Package Created"
echo "============================================"
echo "  File:     $FINAL_OUTPUT"
echo "  Size:     $(du -h "$FINAL_OUTPUT" | cut -f1)"
echo "  UUID:     $RVF_UUID"
echo "  Version:  $VERSION"
echo "  Created:  $RVF_TIMESTAMP"
echo ""
echo "To deploy:"
echo "  tar xzf $FINAL_OUTPUT"
echo "  cd chat-ui-mcp"
echo "  cp config/config.example.json config/config.json"
echo "  cp .env.example .env"
echo "  # Edit config.json and .env with your values"
echo "  docker compose up -d        # local"
echo "  bash scripts/deploy.sh      # Google Cloud Run"
echo ""

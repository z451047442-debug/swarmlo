#!/bin/bash
# Publish script for swarmlo-cli (fork-owned CLI package).
#
# The legacy npm names (@claude-flow/cli and claude-flow) are owned by
# upstream ruvnet and are NOT publishable by this fork — single-name
# publish only. Default tag is `latest`; alpha/v3alpha point at the same
# version for legacy-compat installs.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CLI_DIR"

# Get current version
VERSION=$(node -p "require('./package.json').version")
echo "Publishing version: $VERSION"

# 1. Publish swarmlo-cli (prepublishOnly runs prepare-publish.mjs: build,
#    stage internal bundles, regenerate catalog, re-sign + verify helpers)
echo ""
echo "=== Publishing swarmlo-cli@$VERSION ==="
npm publish

echo ""
echo "=== Updating dist-tags ==="
npm dist-tag add swarmlo-cli@$VERSION alpha
npm dist-tag add swarmlo-cli@$VERSION v3alpha

echo ""
echo "=== Published successfully ==="
echo "  swarmlo-cli@$VERSION (latest, alpha, v3alpha)"
echo ""
echo "Install with:"
echo "  npx swarmlo-cli@latest"
echo "  npx swarmlo@latest        # self-contained root umbrella"

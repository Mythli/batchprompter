#!/bin/bash
set -euo pipefail

# Finds and enriches up to 10 Linktree influencer profiles for each niche in data.csv.
# Output: out/08-influencer-linktree/influencers.csv

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR/../.."

rm -rf out/08-influencer-linktree
mkdir -p out/08-influencer-linktree

# Linktree can throttle bursts of browser visits. Keep this example slow and fresh
# so stale blocked pages are not reused between runs.
export BATCHPROMPT_PUPPETEER_CONCURRENCY="${BATCHPROMPT_PUPPETEER_CONCURRENCY:-1}"
export BATCHPROMPT_PUPPETEER_HEADLESS="true"
export SQLITE_PATH="${SQLITE_PATH:-out/08-influencer-linktree/.cache.sqlite}"

cat examples/08-influencer-linktree/data.csv | node dist/index.js generate --config examples/08-influencer-linktree/config.json "$@"

echo ""
echo "Done! Results saved to out/08-influencer-linktree/influencers.csv"

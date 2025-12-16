#!/bin/bash

# This script finds and dedupes companies based on the industry and location.
# It outputs a single CSV containing all companies: out/13-industry-search/companies.csv
# The industry column is preserved so you can filter by industry.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using JSON config
# Note: --expand-urls flags are preprocessors not supported in JSON config, passed as CLI overrides
npx tsx src/index.ts generate --config examples/13-industry-search/1-find.json \
  --expand-urls-1 \
  --expand-urls-mode-1 puppeteer

echo ""
echo "Done! Results saved to out/13-industry-search/companies.csv"

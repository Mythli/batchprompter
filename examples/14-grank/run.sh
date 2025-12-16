#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# This script:
# 1. Takes keywords from the input CSV
# 2. Searches Google for each keyword (first 3 pages = ~30 results)
# 3. Uses AI to select the Butlerapp link from results
# 4. Outputs the updated CSV with the found Butlerapp URL

npx tsx src/index.ts generate examples/14-grank/data.csv \
  "" \
  --web-search-query "{{keyword}}" \
  --web-search-max-pages 3 \
  --web-search-limit 30 \
  --web-search-mode none \
  --web-select-prompt "Select the link that points to Butlerapp (butlerapp.com, butlerapp.de, or similar Butlerapp domains). If no Butlerapp link exists, select nothing." \
  --web-search-export \
  --model "google/gemini-2.0-flash-001" \
  --tmp-dir "out/14-grank/.tmp" \
  --data-output "out/14-grank/results.csv"

echo ""
echo "Done! Results saved to out/14-grank/results.csv"

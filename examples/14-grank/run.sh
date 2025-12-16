#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# This script:
# 1. Takes keywords from the input CSV
# 2. Searches Google for each keyword (first 3 pages = ~30 results)
# 3. Uses AI to find any link pointing to Butlerapp
# 4. Outputs the updated CSV with the found Butlerapp URL

npx tsx src/index.ts generate examples/14-grank/data.csv \
  "Extract the Butlerapp URL from the search results below.

Rules:
1. Look for any link containing 'butlerapp.com' or 'butlerapp.de' or similar Butlerapp domains.
2. If found, return ONLY the full URL (starting with https://).
3. If no Butlerapp link is found in the results, return an empty string.
4. Do NOT return JSON, Markdown, explanations, or anything else - just the URL or empty string.

Search Results:
{{webSearch}}" \
  --web-search-query "{{keyword}}" \
  --web-search-max-pages 3 \
  --web-search-limit 30 \
  --web-search-mode none \
  --model "google/gemini-2.0-flash-001" \
  --output-column "butlerapp_url" \
  --tmp-dir "out/14-grank/.tmp" \
  --data-output "out/14-grank/results.csv"

echo ""
echo "Done! Results saved to out/14-grank/results.csv"

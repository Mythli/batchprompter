#!/bin/bash

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Go to project root
cd "$DIR/../.."

# Run batchprompt to find company websites
# - Uses web-search-mode 'none' to rely on search snippets (faster than scraping)
# - Outputs result to 'website_url' column
npx tsx src/index.ts generate examples/12-company-search/data.csv \
  --model "gpt-4o" \
  --output-column "website_url" \
  --web-search-query "official website {{name}}" \
  --web-search-limit 5 \
  --web-search-mode none \
  --prompt "Analyze the search results below to identify the official website URL for the company '{{name}}'.

Rules:
1. Return ONLY the URL (e.g., https://www.example.com).
2. Do not include markdown formatting, explanations, or trailing punctuation.
3. If the company is not clearly found, return 'N/A'.
4. Prefer the main corporate domain over social media profiles or directories."

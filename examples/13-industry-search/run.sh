#!/bin/bash

# Ensure we are in the project root
cd "$(dirname "$0")/../.."

# Run the 3-step pipeline
# Step 1: Find companies in the industry (Explodes into multiple rows)
# Step 2: Find the URL for each company
# Step 3: Scrape the URL to find CEO/Contact info

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  examples/13-industry-search/prompts/1-find-companies.md \
  examples/13-industry-search/prompts/2-find-url.md \
  examples/13-industry-search/prompts/3-extract-info.md \
  --web-search-query-1 "Top companies in {{industry}} industry" \
  --json-schema-1 examples/13-industry-search/schemas/companies_array.json \
  --explode-1 \
  --web-search-query-2 "Official website for {{name}}" \
  --web-search-limit-2 1 \
  --output-column-2 url \
  --website-agent-url-3 "{{url}}" \
  --website-agent-schema-3 examples/13-industry-search/schemas/contact.json \
  --website-agent-depth-3 1

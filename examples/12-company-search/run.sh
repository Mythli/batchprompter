#!/bin/bash

npx tsx src/index.ts generate examples/12-company-search/data.csv \
  examples/12-company-search/prompts/identify-url.md \
  examples/12-company-search/prompts/extract-info.md \
  --output-column "website_url" \
  --web-query-prompt examples/12-company-search/prompts/search-query.md \
  --web-search-limit 5 \
  --web-search-mode none \
  --website-agent-url-2 "{{website_url}}" \
  --website-agent-schema-2 "examples/12-company-search/prompts/schema.json" \
  --website-agent-depth-2 1 \
  --output-column-2 "company_info"

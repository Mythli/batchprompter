#!/bin/bash

npx tsx src/index.ts generate examples/12-company-search/data.csv \
  examples/12-company-search/prompts/extract-info.md \
  --web-search-query "Find official website for {{name}}" \
  --web-search-limit 1 \
  --web-search-mode none \
  --website-agent-url "{{web-search.0.link}}" \
  --website-agent-schema "examples/12-company-search/schema.json" \
  --website-agent-depth 1 \
  --output-column "company_info"
/

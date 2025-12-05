#!/bin/bash

npx tsx src/index.ts generate examples/12-company-search/data.csv \
  examples/12-company-search/prompts/extract-info.md \
  --website-agent-url "{{website_url}}" \
  --website-agent-schema "examples/12-company-search/schema.json" \
  --website-agent-depth 1 \
  --output-column "company_info"

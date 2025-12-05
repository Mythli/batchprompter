#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  "" \
  --web-search-query-prompt "Find a list of major companies in the {{industry}} industry including leadership information" \
  --web-search-select-prompt "Select the best list of companies for {{industry}} that might contain CEO or contact details" \
  --web-search-limit 5 \
  --website-agent-url "{{web-search.0.link}}" \
  --json-schema examples/13-industry-search/schemas/companies_array.json \
  --explode

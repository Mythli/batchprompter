#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  "Extract a list of companies and their official website URLs from the content." \
  "Extract the CEO and contact information." \
  --web-search-query-prompt-1 "Find a list of companies in the {{industry}} industry" \
  --web-search-select-prompt-1 "Select the best list of companies for {{industry}}" \
  --web-search-limit-1 5 \
  --website-agent-url-1 "{{web-search.0.link}}" \
  --json-schema-1 examples/13-industry-search/schemas/companies_array.json \
  --explode-1 \
  --website-agent-url-2 "{{url}}" \
  --website-agent-schema-2 examples/13-industry-search/schemas/contact.json \
  --website-agent-depth-2 1

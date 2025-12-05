#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  examples/13-industry-search/prompts/1-find-companies.md \
  examples/13-industry-search/prompts/2-find-url.md \
  examples/13-industry-search/prompts/3-extract-info.md \
  --web-search-query-prompt-1 "Generate a search query to find 5 major companies in the {{industry}} industry" \
  --json-schema-1 examples/13-industry-search/schemas/companies_array.json \
  --explode-1 \
  --web-search-query-prompt-2 "Generate a search query to find the official website for {{name}}" \
  --web-search-select-prompt-2 "Select the official website for {{name}} from the search results" \
  --web-search-limit-2 5 \
  --web-search-export-2 \
  --website-agent-url-3 "{{web-search.0.link}}" \
  --website-agent-schema-3 examples/13-industry-search/schemas/contact.json \
  --website-agent-depth-3 1 \
  --website-agent-export-3

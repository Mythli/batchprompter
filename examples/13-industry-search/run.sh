#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  examples/13-industry-search/prompts/1-find-companies.md \
  examples/13-industry-search/prompts/2-find-url.md \
  examples/13-industry-search/prompts/3-extract-info.md \
  --web-search-query-1 "Firmen die {{industry}} machen" \
  --json-schema-1 examples/13-industry-search/schemas/companies_array.json \
  --explode-1 \
  --web-search-query-2 "Official website for {{name}}" \
  --web-search-limit-2 1 \
  --output-column-2 url \
  --website-agent-url-3 "{{url}}" \
  --website-agent-schema-3 examples/13-industry-search/schemas/contact.json \
  --website-agent-depth-3 1

#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  "" \
  --web-query-prompt "Suche nach {{industry}} Firmen" \
  --web-select-prompt "Versuche echte und eindeutige Firmen-Links aus {{industry}} zu identifizieren" \
  --web-search-limit 5 \
  --website-agent-url "{{web-search.0.link}}" \
  --json-schema examples/13-industry-search/schemas/companies_array.json \
  --explode

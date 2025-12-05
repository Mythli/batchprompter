#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  "" \
  "" \
  --web-query-prompt-1 "Suche nach {{industry}} Firmen" \
  --web-select-prompt-1 "Versuche echte und eindeutige Firmen-Links aus {{industry}} zu identifizieren" \
  --web-search-limit-1 5 \
  --web-search-explode-1 \
  --website-agent-url-2 "{{link}}" \
  --website-agent-schema-2 examples/13-industry-search/schemas/contact.json \
  --website-agent-export-2

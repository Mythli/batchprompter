#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  --web-query-prompt "Suche nach {{industry}} Firmen also Seminaranbieter die Kommunen und grundsätzlich der Regierung Seminare anbieten" \
  --web-select-prompt "Versuche echte und eindeutige Firmen-Links aus {{industry}} zu identifizieren" \
  --web-search-limit 5 \
  --web-search-explode \
  --website-agent-url "{{webSearch.link}}" \
  --website-agent-schema examples/13-industry-search/schemas/contact.json \
  --website-agent-export

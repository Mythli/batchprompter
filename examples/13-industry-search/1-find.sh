#!/bin/bash

# This script finds and dedupes companies based on the industry and location.
# It outputs an intermediate CSV file: out/13-industry-search/{{industry}}/companies.csv

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  \
  "List all German cities with a population over 50,000 in a javascript array of objects (see schema). Be exhaustive. Leave no city that has 50k+ people in Germany out. Return a JSON object containing an array 'locations', where each item has the 'location' (the city name)." \
  --expand-urls-1 \
  --expand-urls-mode-1 puppeteer \
  --model "google/gemini-3-pro-preview" \
  --json-schema-1 examples/13-industry-search/schemas/locations.json \
  --explode-1 \
  --export-1 \
  \
  "" \
  --web-query-2-prompt examples/13-industry-search/prompts/2-find-url.md \
  --web-select-2-prompt "Select only the official websites of companies offering {{industry}}. Ignore directories, lists, aggregators, and job boards." \
  --web-search-max-pages-2 5 \
  --web-search-limit-2 100 \
  --web-search-dedupe-strategy-2 domain \
  --web-search-explode-2 \
  --web-search-export-2 \
  --web-search-gl-2 de \
  --web-search-hl-2 de \
  --dedupe-key-2 "{{webSearch.domain}}" \
  --validate-schema-2 examples/13-industry-search/schemas/link-validation.json \
  \
  --tmp-dir "out/13-industry-search/{{industry}}/.tmp" \
  --data-output "out/13-industry-search/{{industry}}/companies.csv"

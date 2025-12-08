#!/bin/bash

#  "List all German cities with a population over 50,000 in a javascript array of objects (see schema). Be exhaustive. Leave no city that has 50k+ people in Germany out. Return a JSON object containing an array 'locations', where each item has the 'location' (the city name)."

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  \
  "List only Hamburg in Germany only in a javascript array of objects (see schema)." \
  --expand-urls-1 \
  --expand-urls-mode-1 puppeteer \
  --model "google/gemini-3-pro-preview" \
  --json-schema-1 examples/13-industry-search/schemas/locations.json \
  --explode-1 \
  --export-1 \
  \
  "" \
  --web-query-2-prompt examples/13-industry-search/prompts/2-find-url.md \
  --web-select-2-prompt "Select only the official websites of companies offering {{industry}} in {{location}}. Ignore directories, lists, aggregators, and job boards." \
  --web-search-max-pages-2 1 \
  --web-search-limit-2 3 \
  --web-search-dedupe-strategy-2 domain \
  --web-search-explode-2 \
  --web-search-export-2 \
  --web-search-gl-2 de \
  --web-search-hl-2 de \
  --dedupe-key-2 "{{webSearch.domain}}" \
  --website-agent-url-2 "{{webSearch.link}}" \
  --website-agent-depth-2 1 \
  --website-agent-schema-2 examples/13-industry-search/schemas/contact.json \
  --website-agent-export-2 \
  \
  "" \
  --validate-schema-3 examples/13-industry-search/schemas/contact-validation.json \
  \
  "Return the LinkedIn URL from the provided search results. If no valid personal LinkedIn profile is found in the context, return an empty string." \
  --web-search-query-4 "site:linkedin.com/in/ {{decisionMaker.firstName}} {{decisionMaker.lastName}} {{companyName}} -inurl:company" \
  --web-search-limit-4 5 \
  --web-select-4-prompt "Select the LinkedIn personal profile for {{decisionMaker.firstName}} {{decisionMaker.lastName}} at {{companyName}}. The URL MUST contain '/in/'. Do NOT select company pages (containing '/company/'). If the specific person is not found, do not select anything." \
  --output-column-4 "linkedinUrl"

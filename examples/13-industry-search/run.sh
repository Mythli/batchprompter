#!/bin/bash

# Ensure input file exists
if [ ! -f examples/13-industry-search/test.csv ]; then
    echo 'industry' > examples/13-industry-search/test.csv
    echo '"Erste Hilfe Kurse"' >> examples/13-industry-search/test.csv
fi

npx tsx src/index.ts generate examples/13-industry-search/test.csv \
  \
  "Read this page: https://en.wikipedia.org/wiki/List_of_cities_in_Germany_by_population. Extract all cities with a population over 25,000. Return a JSON object containing an array 'locations', where each item has the 'location' (the city name)." \
  --expand-urls-puppeteer-1 \
  --json-schema-1 examples/13-industry-search/schemas/locations.json \
  --explode-1 \
  --export-1 \
  \
  "" \
  --web-query-2-prompt examples/13-industry-search/prompts/2-find-url.md \
  --web-search-paginate-2 \
  --web-search-page-size-2 50 \
  --web-search-limit-2 50 \
  --web-search-dedupe-strategy-2 domain \
  --web-search-explode-2 \
  --web-search-gl-2 de \
  --web-search-hl-2 de \
  --website-agent-url-2 "{{webSearch.link}}" \
  --website-agent-schema-2 examples/13-industry-search/schemas/contact.json \
  --website-agent-export-2 \
  --output-2 "leads/{{location}}_{{company_name}}.json"

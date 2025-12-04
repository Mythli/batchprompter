#!/bin/bash

npx tsx src/index.ts generate examples/12-company-search/data.csv \
  "Analyze the search results below to identify the official website URL for the company '{{name}}'.

Rules:
1. Return ONLY the URL (e.g., https://www.example.com).
2. Do not include markdown formatting, explanations, or trailing punctuation.
3. If the company is not clearly found, return ''.
4. Prefer the main corporate domain over social media profiles or directories." \
"Extract the CEO/Decision Maker's name and company contact details from the website data." \
  --output-column "website_url" \
  --web-query-prompt "Find the official website for the company '{{name}}'. Generate search queries to find their main homepage. To generate the queries exclude the person and try different variants/spellings. usually it pays to just search for the company name." \
  --web-search-limit 5 \
  --web-search-mode none \
  --website-agent-url-2 "{{website_url}}" \
  --website-agent-schema-2 "examples/12-company-search/schema.json" \
  --website-agent-depth-2 1 \
  --output-column-2 "company_info"

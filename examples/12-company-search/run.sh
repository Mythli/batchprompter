#!/bin/bash

npx tsx src/index.ts generate examples/12-company-search/data.csv \
  "Analyze the search results below to identify the official website URL for the company '{{name}}'.

Rules:
1. Return ONLY the URL (e.g., https://www.example.com).
2. Do not include markdown formatting, explanations, or trailing punctuation.
3. If the company is not clearly found, return ''.
4. Prefer the main corporate domain over social media profiles or directories." \
  --output-column "website_url" \
  --web-search-query "{{name}}" \
  --web-search-limit 5 \
  --web-search-mode none

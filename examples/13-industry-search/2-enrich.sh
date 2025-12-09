#!/bin/bash

# This script takes the list of companies (examples/13-industry-search/companies.csv)
# and enriches it with contact details, LinkedIn profiles, and offers.

npx tsx src/index.ts generate examples/13-industry-search/test_processed.csv \
  \
  "" \
  --limit 50 \
  --model "google/gemini-3-pro-preview" \
  --website-agent-url-1 "{{link}}" \
  --website-agent-depth-1 1 \
  --website-agent-schema-1 examples/13-industry-search/schemas/contact.json \
  --website-agent-export-1 \
  \
  "" \
  --validate-schema-2 examples/13-industry-search/schemas/contact-validation.json \
  \
  "You are a data extraction engine. Extract the LinkedIn URL for {{decisionMaker.firstName}} {{decisionMaker.lastName}} from the search results.
Output Rules:
1. Return ONLY the URL (starting with https://).
2. If no valid personal profile is found, return an empty string.
3. Do NOT return JSON, Markdown, quotes, or explanations." \
  --web-search-query-3 "site:linkedin.com/in/ {{decisionMaker.firstName}} {{decisionMaker.lastName}} {{companyName}} -inurl:company" \
  --web-search-limit-3 5 \
  --web-select-3-prompt "Select the LinkedIn personal profile for {{decisionMaker.firstName}} {{decisionMaker.lastName}} at {{companyName}}. The URL MUST contain '/in/'. Do NOT select company pages (containing '/company/'). If the specific person is not found, do not select anything." \
  --output-column-3 "linkedinUrl" \
  \
  "You are a content formatter.
Task: Format the extracted offers from the provided JSON data into a readable bulleted list.

Data: {{websiteAgent.offers}}

Output Format:
- **Name** (Price | Dates): Description

Guidelines:
- Include Price and Dates if available.
- If Price or Dates are missing, omit them from the parentheses.
- Return ONLY the bulleted list.

If the data is empty, return an empty text.

You need to write in german." \
  --website-agent-url-4 "{{link}}" \
  --website-agent-depth-4 1 \
  --website-agent-schema-4 examples/13-industry-search/schemas/offers.json \
  --output-column-4 "offers"

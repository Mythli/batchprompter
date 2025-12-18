#!/bin/bash

# This script finds and dedupes companies based on the industry and location.
# It outputs a single CSV containing all companies: out/13-industry-search/companies.csv
# The industry column is preserved so you can filter by industry.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Define configuration inline
CONFIG=$(cat <<EOF
{
  "globals": {
    "model": "google/gemini-3-flash-preview",
    "thinkingLevel": "high",
    "tmpDir": "out/02-lead-gen/.tmp",
    "outputPath": "out/02-lead-gen/companies.csv"
  },
  "steps": [
    {
      "prompt": "List all cities in Germany with more than 50,000 inhabitants. Return a JSON object containing an array 'locations', where each item has the 'location' (the city name).\n",
      "schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string"
            }
          },
          "required": [
            "location"
          ]
        }
      },
      "output": {
        "mode": "merge",
        "explode": true
      },
      "preprocessors": [
        {
          "type": "url-expander",
          "mode": "puppeteer"
        }
      ]
    },
    {
      "plugins": [
        {
          "type": "web-search",
          "queryPrompt": "Generate 3 distinct search queries to find the official websites of companies offering {{industry}} in {{location}}. Focus on finding direct company websites only. Do not include directories, lists, or aggregators.\n",
          "selectPrompt": "Select only the official websites of companies offering {{industry}}. Ignore directories, lists, aggregators, and job boards. It does not matter where the companies are.\n",
          "maxPages": 1,
          "limit": 100,
          "dedupeStrategy": "domain",
          "gl": "de",
          "hl": "de",
          "output": {
            "mode": "merge",
            "explode": true
          }
        },
        {
          "type": "dedupe",
          "key": "{{webSearch.domain}}"
        },
        {
          "type": "validation",
          "schema": {
            "type": "object",
            "properties": {
              "link": {
                "type": "string",
                "minLength": 1
              }
            },
            "required": [
              "link"
            ]
          }
        }
      ]
    }
  ]
}
EOF
)

# Run using inline JSON config
cat examples/02-lead-gen/test.csv | npx tsx src/index.ts generate --config "$CONFIG"

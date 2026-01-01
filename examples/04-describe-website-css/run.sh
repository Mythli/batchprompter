#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/04-describe-website-css

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to GPT-4o to generate a design description.

cat examples/04-describe-website-css/data.csv | npx tsx src/index.ts generate \
  "examples/04-describe-website-css/describe-styles.md" \
  --style-scrape-url "{{website_url}}" \
  --style-scrape-resolution "1920x1080" \
  --style-scrape-mobile \
  --style-scrape-interactive \
  --tmp-dir "out/04-describe-website-css/{{website_url}}/.tmp" \
  --output "out/04-describe-website-css/{{website_url}}/style-analysis.md"

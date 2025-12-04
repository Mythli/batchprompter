#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to GPT-4o to generate a design description.

npx tsx src/index.ts generate examples/describe-website-css/data.csv \
  "examples/describe-website-css/style-booking-form.md" \
  "examples/describe-website-css/style-table.md" \
  "examples/describe-website-css/combine-all-css.md" \
  --style-scrape-url "{{website_url}}" \
  --style-scrape-resolution "1920x1080" \
  --style-scrape-mobile \
  --style-scrape-interactive \
  --output "out/describe-website-css/{{website_url}}/booking_form.css" \
  --output-2 "out/describe-website-css/{{website_url}}/table.css" \
  --command "sed -i.bak '/^\`\`\`/d' '{{file}}' && rm '{{file}}.bak'"

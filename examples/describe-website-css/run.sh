#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to GPT-4o to generate a design description.

npx tsx src/index.ts generate examples/describe-website-css/data.csv \
  "examples/describe-website-css/prompt.md" \
  --style-scrape-url "{{website_url}}" \
  --style-scrape-resolution "1920x1080" \
  --style-scrape-mobile \
  --style-scrape-interactive \
  --output "examples/describe-website-css/output/{{website_url}}.css" \
  --model "gpt-4o" \
  --command "sed -i.bak '/^\`\`\`/d' '{{file}}' && rm '{{file}}.bak'"

#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to GPT-4o to generate a design description.

cat examples/04-describe-website-css/data.csv | npx tsx src/index.ts generate --config examples/04-describe-website-css/config.json

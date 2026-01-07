#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/04-describe-website-css

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to the AI to generate a design description.

cat examples/04-describe-website-css/data.csv | node dist/index.js generate --config examples/04-describe-website-css/config.json

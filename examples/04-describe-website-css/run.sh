#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Define configuration inline
CONFIG=$(cat <<EOF
{
  "globals": {
    "model": "gpt-4o",
    "tmpDir": "out/04-describe-website-css/.tmp"
  },
  "steps": [
    {
      "prompt": {
        "file": "examples/04-describe-website-css/describe-styles.md"
      },
      "output": {
        "mode": "ignore"
      },
      "outputPath": "out/04-describe-website-css/{{website_url}}/style-analysis.md",
      "plugins": [
        {
          "type": "style-scraper",
          "url": "{{website_url}}",
          "resolution": "1920x1080",
          "mobile": true,
          "interactive": true
        }
      ]
    }
  ]
}
EOF
)

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to GPT-4o to generate a design description.

cat examples/04-describe-website-css/data.csv | npx tsx src/index.ts generate --config "$CONFIG"

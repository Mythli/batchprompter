#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Define configuration inline
CONFIG=$(cat <<EOF
{
  "data": {
    "limit": 10
  },
  "globals": {
    "model": "google/gemini-3-flash-preview",
    "tmpDir": "out/03-seo-rank/.tmp",
    "outputPath": "out/03-seo-rank/results.csv"
  },
  "steps": [
    {
      "plugins": [
        {
          "type": "web-search",
          "query": "{{keyword}}",
          "maxPages": 3,
          "limit": 30,
          "mode": "none",
          "gl": "de",
          "hl": "de",
          "selectPrompt": "Select up to 10 links that point to Butlerapp (butlerapp.de). If no Butlerapp link exists, select nothing.",
          "output": {
            "mode": "merge",
            "explode": true
          }
        }
      ]
    }
  ]
}
EOF
)

# Run using inline JSON config
cat examples/03-seo-rank/data.csv | npx tsx src/index.ts generate --config "$CONFIG"

echo ""
echo "Done! Results saved to out/03-seo-rank/results.csv"

#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Define configuration inline
CONFIG=$(cat <<EOF
{
  "globals": {
    "model": "google/gemini-3-flash-preview",
    "dataOutputPath": "out/05-simple-chain/results.csv"
  },
  "steps": [
    {
      "prompt": "Generate a creative band name for a {{genre}} band. Return ONLY the name, nothing else.",
      "output": {
        "mode": "column",
        "column": "band_name"
      }
    },
    {
      "prompt": "Write a short, catchy slogan for the band '{{band_name}}'.",
      "output": {
        "mode": "column",
        "column": "slogan"
      }
    },
    {
      "prompt": "Act as a harsh music critic. Judge the potential of the band '{{band_name}}' with the slogan '{{slogan}}'. Write a short review.",
      "candidates": 3,
      "output": {
        "mode": "column",
        "column": "reviews"
      }
    }
  ]
}
EOF
)

# Run using inline JSON config
cat examples/05-simple-chain/data.csv | npx tsx src/index.ts generate --config "$CONFIG"

echo ""
echo "Done! Results saved to out/05-simple-chain/results.csv"

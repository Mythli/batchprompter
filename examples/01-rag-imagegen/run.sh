#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Define configuration inline
CONFIG=$(cat <<EOF
{
  "globals": {
    "model": "google/gemini-3-pro-image-preview",
    "tmpDir": "out/01-rag-imagegen/{{industry}}/.tmp/HeroImage.jpg",
    "outputPath": "out/01-rag-imagegen/{{industry}}/HeroImage.jpg"
  },
  "steps": [
    {
      "prompt": {
        "file": "examples/01-rag-imagegen/prompt.md"
      },
      "aspectRatio": "3:2",
      "candidates": 2,
      "command": "magick '{{file}}' -resize 900x600 -quality 85 '{{file}}'",
      "plugins": [
        {
          "type": "image-search",
          "queryModel": "google/gemini-3-flash-preview",
          "queryPrompt": {
            "file": "examples/01-rag-imagegen/query-prompt.md"
          },
          "queryCount": 5,
          "selectModel": "google/gemini-3-flash-preview",
          "selectThinkingLevel": "high",
          "selectPrompt": {
            "file": "examples/01-rag-imagegen/select-prompt.md"
          },
          "maxPages": 1,
          "spriteSize": 6,
          "select": 6,
          "output": {
            "mode": "ignore",
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
echo -e "industry\nSailing school" | npx tsx src/index.ts generate --config "$CONFIG"

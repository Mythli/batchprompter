#!/bin/bash
# Example run command for image generation
# This demonstrates:
# 1. Generating images based on a prompt template
# 2. Using the --aspect-ratio flag to trigger image generation mode
# 3. Using a system prompt to guide the style (though less critical for image models, it can still influence)

npx tsx src/index.ts generate \
  examples/10-image/data.csv \
  examples/10-image/prompt-1-industry-image \
  examples/10-image/prompt-2-butlerapp-software \
  examples/10-image/prompt-4-industry-icon \
  -o out/10-image/{{industry}}.png \
  --aspect-ratio-1 3:2 \
  --aspect-ratio-2 3:2 \
  --aspect-ratio-3 1:1 \
  --model google/gemini-3-pro-image-preview

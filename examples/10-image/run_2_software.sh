#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-gen.md examples/10-image/prompt-2-butlerapp-software \
  --output-column-1 "software_prompt" \
  --output-2 "out/10-image/2-software/{{id}}.png" \
  --aspect-ratio-2 "3:2" \
  --model "google/gemini-3-pro-image-preview"

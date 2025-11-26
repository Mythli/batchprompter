#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-1-industry-image \
  --output "out/10-image/{{industry}}/{{industry}}-real.png" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview"

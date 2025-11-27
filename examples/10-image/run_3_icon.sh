#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-industry-icon \
  --output "out/10-image/{{industry}}/01_MenuBarIcon.png" \
  --aspect-ratio "1:1" \
  --model "google/gemini-3-pro-image-preview"

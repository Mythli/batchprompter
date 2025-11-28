#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-1-hero-image \
  --output "out/10-image/{{industry}}/02_HeroImage.png" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview"

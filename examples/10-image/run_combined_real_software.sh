#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv \
  examples/10-image/prompt-1-industry-image \
  examples/10-image/prompt-4-booking-form \
  --model "google/gemini-3-pro-image-preview" \
  --output-1 "out/10-image/{{industry}}/{{industry}}-real.png" \
  --aspect-ratio-1 "3:2" \
  --output-2 "out/10-image/{{industry}}/{{industry}}-software.png" \
  --aspect-ratio-2 "1:1"

#!/bin/bash
# Run generation for Real Industry Image
npx tsx ../../../src/index.ts generate \
  data.csv \
  . \
  -o ../out/1-real/{{industry}}.png \
  --aspect-ratio 3:2 \
  --model google/gemini-3-pro-image-preview

#!/bin/bash
# Run generation for Industry Icon
npx tsx ../../../src/index.ts generate \
  data.csv \
  . \
  -o ../out/3-icon/{{industry}}.png \
  --aspect-ratio 1:1 \
  --model google/gemini-3-pro-image-preview

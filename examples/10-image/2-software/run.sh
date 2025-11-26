#!/bin/bash
# Run generation for Software Image
# Note: Ensure reference images (e.g. logo, software screenshot) are present in this directory if referenced by the prompt.
npx tsx ../../../src/index.ts generate \
  data.csv \
  . \
  -o ../out/2-software/{{industry}}.png \
  --aspect-ratio 3:2 \
  --model google/gemini-3-pro-image-preview

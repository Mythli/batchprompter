#!/bin/bash
npx tsx ../../src/index.ts generate data.csv prompt-1-industry-image \
  --output "out/1-real/{{id}}.png" \
  --aspect-ratio "3:2" \
  --model "recraft-v3"

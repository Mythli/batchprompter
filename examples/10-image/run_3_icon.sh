#!/bin/bash
npx tsx ../../src/index.ts generate data.csv prompt-4-industry-icon \
  --output "out/3-icon/{{id}}.png" \
  --aspect-ratio "1:1" \
  --model "recraft-v3"

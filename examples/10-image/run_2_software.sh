#!/bin/bash
npx tsx ../../src/index.ts generate data.csv prompt-2-butlerapp-software \
  --output "out/2-software/{{id}}.png" \
  --aspect-ratio "3:2" \
  --model "recraft-v3"

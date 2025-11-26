#!/bin/bash
node ../../dist/index.js generate data.csv prompt-1-industry-image \
  --output "out/1-real/{{id}}.png" \
  --aspect-ratio "3:2" \
  --model "recraft-v3"

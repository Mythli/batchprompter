#!/bin/bash
node ../../dist/index.js generate data.csv prompt-2-butlerapp-software \
  --output "out/2-software/{{id}}.png" \
  --aspect-ratio "3:2" \
  --model "recraft-v3"

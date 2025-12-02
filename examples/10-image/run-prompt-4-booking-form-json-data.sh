#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form-json-data/prompt.md \
  --schema examples/10-image/schema.json \
  --output "out/10-image/{{industry}}/form_data.json"

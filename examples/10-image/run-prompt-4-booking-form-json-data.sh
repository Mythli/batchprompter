#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form-json-data/prompt.md \
  --schema examples/10-image/prompt-4-booking-form-json-data/schema.json \
  --output "out/10-image/{{industry}}/form_data.json" \
  --model "google/gemini-3-pro-preview"

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form-json-data/color_prompt.md \
  --schema examples/10-image/prompt-4-booking-form-json-data/color_schema.json \
  --output "out/10-image/{{industry}}/color_data.json" \
  --model "google/gemini-3-pro-preview"

# {{industry}} is only a template placeholder for the generator, the shell does not expand it.
# After generation, copy tablet_data.json and user_image.png into each industry folder under out/10-image/.
for dir in out/10-image/*/; do
  cp examples/10-image/prompt-4-booking-form-json-data/tablet_data.json "${dir%/}/tablet_data.json"
  cp examples/10-image/prompt-4-booking-form-json-data/user_image.png "${dir%/}/user_image.png"
done
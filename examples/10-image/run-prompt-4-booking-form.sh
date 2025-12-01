#!/bin/bash

# Remove seed file if it exists to ensure clean state
rm -f examples/10-image/prompt-4-booking-form/seed.txt

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form \
  --output-1 "out/10-image/{{industry}}/04_AboutCourse.jpg" \
  --aspect-ratio-1 "4:3" \
  --model "google/gemini-3-pro-image-preview" \
  --image-query-1-prompt "Find a high-quality, bright, atmospheric photo representing {{industry}} in a German setting. No text overlay." \
  --image-select-1-prompt "Select the best image that represents {{industry}}. It should be bright, high-quality photography, and suitable for use as a background." \
  --candidates-1 3 \
  --judge-1-model "google/gemini-3-pro-preview" \
  --judge-1-prompt examples/10-image/select-best-image.md \
  --skip-candidate-command-1 \
  --command "magick '{{file}}' examples/10-image/assets/phoneinhand.png -gravity center -composite '{{file}}' && npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'out/10-image/{{industry}}/01_MenuBarIcon.svg' '{{file}}.tmp.jpg' --scale 1 --scale-content 1.6 --scale-logo 1.5 --supersample 8 && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 1024x1024 -quality 95 '{{file}}'"

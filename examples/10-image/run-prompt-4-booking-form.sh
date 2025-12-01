#!/bin/bash

# Remove seed file if it exists to ensure clean state
rm -f examples/10-image/prompt-4-booking-form/seed.txt

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form \
  --output "out/10-image/{{industry}}/06_BookingForm.jpg" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview" \
  --image-search-prompt "Generate search queries for {{industry}} related keywords. Specifically look for images with a girl or female person in focus doing the core activity of {{industry}} or in an {{industry}} setting." \
  --image-select-prompt "Select the image that best shows a girl or female person 20-30 years old, in focus doing the core activity of {{industry}} with her face visible. Disqualify pictures that have a lot of people in focus, look AI generated, have a low quality in general or have watermarks." \
  --candidates 3 \
  --judge-model "google/gemini-3-pro-preview" \
  --judge-prompt examples/10-image/select-best-image.md \
  --skip-candidate-command \
  --command "magick '{{file}}' -resize 1200x800^ -gravity center -extent 1200x800 '{{file}}' && magick '{{file}}' examples/10-image/assets/iphone15_black.png -gravity center -composite '{{file}}' && npx tsx src/insertbookingform.ts '{{file}}' examples/10-image/prompt-4-booking-form-json-data/schema.json examples/10-image/assets/logo.png '{{file}}' --scale 0.8 && magick '{{file}}' -quality 85 '{{file}}'"

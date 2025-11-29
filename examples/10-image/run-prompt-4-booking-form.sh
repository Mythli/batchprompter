#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-4-booking-form/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form \
    --output-1 "out/10-image/{{industry}}/04_AboutCourse-$i.jpg" \
    --aspect-ratio-1 "4:3" \
    --model "google/gemini-3-pro-image-preview"
#    --command "npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'examples/10-image/logo.png' '{{file}}.tmp.jpg' --scale 1 --scale-content 1.6 --supersample 8  && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 800x800 -quality 95 '{{file}}'"
done

rm examples/10-image/prompt-4-booking-form/seed.txt

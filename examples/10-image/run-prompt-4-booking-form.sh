#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-4-booking-form/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-4-booking-form \
    --output-1 "out/10-image/{{industry}}/04_AboutCourse-$i.jpg" \
    --aspect-ratio-1 "4:3" \
    --model "google/gemini-3-pro-image-preview" \
    --candidates-1 4 \
    --candidate-output-1 "out/10-image-candidates/{{industry}}/04_AboutCourse-$i_c{{candidate_index}}.jpg" \
    --judge-model-1 "google/gemini-3-pro-preview" \
    --judge-prompt-1 examples/10-image/select-best-image.md \
    --skip-candidate-command-1 \
    --command "npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'out/10-image/{{industry}}/01_MenuBarIcon.svg' '{{file}}.tmp.jpg' --scale 1 --scale-content 1.6 --scale-logo 1.5 --supersample 8  && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 1024x1024 -quality 95 '{{file}}'"
done

rm examples/10-image/prompt-4-booking-form/seed.txt

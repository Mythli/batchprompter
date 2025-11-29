#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-6-dashboard/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-6-dashboard \
    --output-1 "out/10-image/{{industry}}/06_YourBenefitsImage-$i.jpg" \
    --aspect-ratio-1 "4:3" \
    --model "google/gemini-3-pro-image-preview" \
    --candidates-1 4 \
    --candidate-output-1 "out/10-image-candidates/{{industry}}/06_YourBenefitsImage-$i_c{{candidate_index}}.jpg" \
    --judge-model-1 "google/gemini-3-pro-preview" \
    --judge-prompt-1 examples/10-image/select-best-image.md \
    --skip-candidate-command-1 \
    --command "magick '{{file}}' examples/10-image/tablet_in_hands.png -gravity center -composite '{{file}}'"
#    --command "npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'examples/10-image/logo.png' '{{file}}.tmp' && mv '{{file}}.tmp' '{{file}}' && magick '{{file}}' -resize 800x800 -quality 85 '{{file}}'"
done

rm examples/10-image/prompt-6-dashboard/seed.txt

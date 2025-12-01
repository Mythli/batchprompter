#!/bin/bash

# Remove seed file if it exists to ensure clean state
rm -f examples/10-image/prompt-6-dashboard/seed.txt

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-6-dashboard \
  --output-1 "out/10-image/{{industry}}/06_YourBenefitsImage.jpg" \
  --aspect-ratio-1 "4:3" \
  --model "google/gemini-3-pro-image-preview" \
  --image-search-prompt-1 "Find a high-quality, bright, atmospheric photo representing {{industry}} in a German setting. Focus on the actual work environment or typical setting for this industry (e.g. outdoors, workshop, classroom). Avoid generic office images. No text overlay." \
  --image-select-prompt-1 "Select the best image that represents {{industry}}. It should be bright, high-quality photography, and suitable for use as a background. It should show the specific environment of the industry." \
  --candidates-1 3 \
  --judge-model-1 "google/gemini-3-pro-preview" \
  --judge-prompt-1 examples/10-image/select-best-image.md \
  --skip-candidate-command-1 \
  --command "magick '{{file}}' examples/10-image/tablet_in_hands.png -gravity center -composite '{{file}}'"

#!/bin/bash

# Remove seed file if it exists to ensure clean state
rm -f examples/10-image/prompt-2-teaser2/seed.txt

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser2 \
  --output "out/10-image/{{industry}}/05_AboutCourseSecondImage.jpg" \
  --aspect-ratio "1:1" \
  --model "google/gemini-3-pro-image-preview" \
  --image-search-prompt "Generate search queries for {{industry}} related keywords. Specifically look for images with a man or male person in focus doing the core activity of {{industry}} or in an {{industry}} setting." \
  --image-select-prompt "Select the image that best shows a man or male person 30-45 years old, in focus doing the core activity of {{industry}} with his face visible. Disqualify pictures that have a lot of people in focus, look AI generated, have a low quality in general or have watermarks." \
  --candidates 3 \
  --judge-model "google/gemini-3-pro-preview" \
  --judge-prompt examples/10-image/select-best-image.md \
  --skip-candidate-command \
  --command "magick '{{file}}' -resize 600x600 -quality 85 '{{file}}'"

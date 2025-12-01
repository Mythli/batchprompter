#!/bin/bash

# Remove seed file if it exists to ensure clean state
rm -f examples/10-image/prompt-2-teaser/seed.txt

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser \
  --output "out/10-image/{{industry}}/04_AboutCourseFirstImage.jpg" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview" \
  --image-query-prompt "Generate search queries for {{industry}} related keywords. Specifically look for images with a girl or female person in focus doing the core activity of {{industry}} or in an {{industry}} setting." \
  --image-select-prompt "Select the image that best shows a girl or female person 20-30 years old, in focus doing the core activity of {{industry}} with her face visible. Disqualify pictures that have a lot of people in focus, look AI generated, look too perfect, have a low quality in general or have watermarks." \
  --candidates 3 \
  --judge-model "google/gemini-3-pro-preview" \
  --judge-prompt examples/10-image/select-best-image.md \
  --skip-candidate-command \
  --command "magick '{{file}}' -resize 600x400 -quality 85 '{{file}}'" \
#  --feedback-loops 1 \
#  --feedback-prompt examples/10-image/image-feedback.md \
#  --feedback-model "google/gemini-3-pro-preview" \

#!/bin/bash

# Remove seed file if it exists to ensure clean state
rm -f examples/10-image/prompt-2-teaser/seed.txt

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser \
  --output "out/10-image/{{industry}}/04_AboutCourseFirstImage.jpg" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview" \
  --candidates 3 \
  --candidate-output "out/10-image-candidates/{{industry}}/04_AboutCourseFirstImage_c{{candidate_index}}.jpg" \
  --judge-model "google/gemini-3-pro-preview" \
  --judge-prompt examples/10-image/select-best-image.md \
  --skip-candidate-command \
  --command "magick '{{file}}' -resize 800x533 -quality 85 '{{file}}'"
#  --feedback-loops 1 \
#  --feedback-prompt examples/10-image/image-feedback.md \
#  --feedback-model "google/gemini-3-pro-preview" \

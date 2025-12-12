#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser \
  --output "out/10-image/{{industry}}/02_HeroImage.jpg" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview" \
  --image-query-prompt "Generate search queries for {{industry}} related keywords. Specifically look for images with a girl or female person in focus doing the core activity of {{industry}} or in an {{industry}} setting." \
  --image-select-prompt "Select the image that has a girl, 18-30 years old, as the focal person doing the core activity of {{industry}}. Avoid images with lots of people. Try to find a picture with one person only. Her face and chest must be visible. Prefer alive shots over polished Shutterstock images. We want to capture real moments. Disqualify pictures where the focal person is a child, the picture includes a mirror, has low quality or has any visible watermarks or digitally added overlays." \
  --image-search-max-pages 3 \
  --image-search-sprite-size 6 \
  --image-search-select 3 \
  --image-search-explode \
  --candidates 3 \
  --command "magick '{{file}}' -resize 900x600 -quality 85 '{{file}}'" \
  #  --judge-model "google/gemini-3-pro-preview" \
#  --judge-prompt examples/10-image/select-best-image.md \
#  --skip-candidate-command \
#  --feedback-loops 1 \
#  --feedback-prompt examples/10-image/image-feedback.md \
#  --feedback-model "google/gemini-3-pro-preview" \

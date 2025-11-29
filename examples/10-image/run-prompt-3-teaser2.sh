#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-2-teaser2/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser2 \
    --output "out/10-image/{{industry}}/05_AboutCourseSecondImage-$i.jpg" \
    --aspect-ratio "3:2" \
    --model "google/gemini-3-pro-image-preview" \
    --candidates 4 \
    --candidate-output "out/10-image-candidates/{{industry}}/05_AboutCourseSecondImage-$i_c{{candidate_index}}.jpg" \
    --judge-model "google/gemini-3-pro-preview" \
    --judge-prompt examples/10-image/select-best-image.md \
    --skip-candidate-command \
    --command "magick '{{file}}' -resize 800x533 -quality 85 '{{file}}'"
done

rm examples/10-image/prompt-2-teaser2/seed.txt

#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-2-teaser/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser \
    --output "out/10-image/{{industry}}/04_AboutCourseFirstImage-$i.jpg" \
    --aspect-ratio "3:2" \
    --model "google/gemini-3-pro-image-preview" \
    --command "magick '{{file}}' -resize 800x533 -quality 85 '{{file}}'"
done

rm examples/10-image/run-prompt-2-teaser/seed.txt

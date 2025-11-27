#!/bin/bash

for i in {1..3}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-2-butlerapp-software/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-butlerapp-software \
    --output-1 "out/10-image/{{industry}}/04_AboutCourseFirstImage-$i.jpg" \
    --aspect-ratio-1 "1:1" \
    --model "google/gemini-3-pro-image-preview" \
    --command "npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'examples/10-image/logo.png' '{{file}}.tmp' && mv '{{file}}.tmp' '{{file}}' && convert '{{file}}' -resize 450x450 -quality 85 '{{file}}'"
done

rm examples/10-image/prompt-2-butlerapp-software/seed.txt

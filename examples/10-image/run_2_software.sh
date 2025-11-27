#!/bin/bash

for i in {1..3}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-butlerapp-software seed.txt \
    --output-1 "out/10-image/attempt-$i/{{industry}}/{{industry}}-software.png" \
    --aspect-ratio-1 "1:1" \
    --model "google/gemini-3-pro-image-preview"
done

rm seed.txt

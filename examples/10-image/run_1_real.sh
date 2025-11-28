#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-1-hero-image/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-1-hero-image \
    --output "out/10-image/{{industry}}/02_HeroImage-$i.png" \
    --aspect-ratio "3:2" \
    --model "google/gemini-3-pro-image-preview"
done

rm examples/10-image/prompt-1-hero-image/seed.txt

#!/bin/bash

for i in {1..5}
do
  # Create a temporary seed file to ensure the prompt is unique for each attempt,
  # forcing a fresh generation even with caching enabled.
  echo "Generation Attempt: $i" > examples/10-image/prompt-10-icon/seed.txt

  npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-10-icon \
    --output "out/10-image/{{industry}}/01_MenuBarIcon-$i.png" \
    --aspect-ratio "1:1" \
    --model "google/gemini-3-pro-image-preview" \
    --command "magick '{{file}}' -trim +repage -background none -gravity center -extent '%[fx:max(w,h)]x%[fx:max(w,h)]' -fuzz 90% -transparent white -fill '{{color}}' -colorize 100% '{{file}}' && pngquant 2 --nofs --force --output '{{file}}' '{{file}}'"
done

rm examples/10-image/prompt-10-icon/seed.txt

#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-10-icon \
  --output "out/10-image/{{industry}}/01_MenuBarIcon.png" \
  --candidates 5 \
  --aspect-ratio "1:1" \
  --model "google/gemini-3-pro-image-preview" \
  --command "magick '{{file}}' -trim +repage -background none -gravity center -extent '%[fx:max(w,h)]x%[fx:max(w,h)]' -fuzz 90% -transparent white '{{file}}' && pngquant 2 --nofs --force --output '{{file}}' '{{file}}' && ./examples/10-image/vectorize.sh '{{file}}'"

#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-10-icon \
  --output "out/10-image/{{industry}}/01_MenuBarIcon.png" \
  --candidates 10 \
  --judge-model "google/gemini-3-pro-preview" \
  --judge-prompt "You are an expert Art Director. Select the best candidate for a '{{industry}}' icon. Criteria: 1. Simplicity: Must be a single, solid black shape. No thin lines, no internal details. 2. Relevance: Immediately recognizable as '{{industry}}'. 3. Composition: Massive, centered, filling the canvas. 4. Style: Swiss International Style. 5. Technical: No floating separate parts, no text. Return the index of the best candidate." \
  --skip-candidate-command \
  --aspect-ratio "1:1" \
  --model "google/gemini-3-pro-image-preview" \
  --command "magick '{{file}}' -trim +repage -background none -gravity center -extent '%[fx:max(w,h)]x%[fx:max(w,h)]' -fuzz 90% -transparent white '{{file}}' && pngquant 2 --nofs --force --output '{{file}}' '{{file}}' && ./examples/10-image/vectorize.sh '{{file}}'"

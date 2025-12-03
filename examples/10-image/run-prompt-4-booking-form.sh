#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv \
  --output-1 "out/10-image/{{industry}}/04_AboutCourse.jpg" \
  --aspect-ratio-1 "4:3" \
  --image-query-prompt "Find a high-quality, bright, atmospheric photo representing {{industry}} in a German setting. No text overlay." \
  --image-select-prompt "Select the best image that represents {{industry}}. It should be bright, high-quality photography, and suitable for use as a background." \
  --command "magick '{{file}}' -resize 1024x768^ -gravity center -extent 1024x768 -blur 0x5 examples/10-image/assets/phoneinhand.png -gravity center -composite '{{file}}' && npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'out/10-image/{{industry}}/01_MenuBarIcon.svg' '{{file}}.tmp.jpg' --scale 1 --scale-content 1.6 --scale-logo 1.5 --supersample 8 && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 1024x1024 -quality 95 '{{file}}'"

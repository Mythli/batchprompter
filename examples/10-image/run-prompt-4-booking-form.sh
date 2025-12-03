#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv \
  --output-1 "out/10-image/{{industry}}/04_AboutCourse.jpg" \
  --aspect-ratio-1 "4:3" \
<<<<<<< HEAD
  --model "google/gemini-3-pro-image-preview" \
  --image-search-prompt-1 "Find a high-quality, bright, atmospheric photo representing {{industry}} in a German setting. No text overlay." \
  --image-select-prompt-1 "Select the best image that represents {{industry}}. It should be bright, high-quality photography, and suitable for use as a background." \
  --candidates-1 3 \
  --judge-model-1 "google/gemini-3-pro-preview" \
  --judge-prompt-1 examples/10-image/select-best-image.md \
  --skip-candidate-command-1 \
  --command "magick '{{file}}' examples/10-image/assets/phoneinhand.png -gravity center -composite '{{file}}' && npx tsx src/insertbookingform_mobile.ts '{{file}}' 'out/10-image/{{industry}}/data.json' 'out/10-image/{{industry}}/01_MenuBarIcon.svg' '{{file}}.tmp.jpg' --scale 1 --scale-content 1.6 --scale-logo 1.5 --supersample 8 && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 1024x1024 -quality 95 '{{file}}'"
=======
  --image-query-prompt "Find a high-quality, bright, atmospheric photo representing {{industry}} in a German setting. No text overlay." \
  --image-select-prompt "Select the best image that represents {{industry}}. It should be bright, high-quality photography, and suitable for use as a background." \
  --command "magick '{{file}}' -resize 1024x768^ -gravity center -extent 1024x768 -blur 0x5 examples/10-image/assets/phoneinhand.png -gravity center -composite '{{file}}' && npx tsx src/insertbookingform.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'out/10-image/{{industry}}/01_MenuBarIcon.svg' '{{file}}.tmp.jpg' --scale 1 --scale-content 1.6 --scale-logo 1.5 --supersample 8 && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 1024x1024 -quality 95 '{{file}}'"
>>>>>>> a203bc21a948caa0d775114b6f2779d525324115

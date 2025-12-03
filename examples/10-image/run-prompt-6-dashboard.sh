#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv \
  --output-1 "out/10-image/{{industry}}/06_YourBenefitsImage.jpg" \
  --aspect-ratio-1 "4:3" \
  --image-query-prompt "Find a high-quality, bright, atmospheric photo representing {{industry}} in a German setting. Focus on the actual work environment or typical setting for this industry (e.g. outdoors, workshop, classroom). Avoid generic office images. No text overlay." \
  --image-select-prompt "Select the best image that represents {{industry}}. It should be bright, high-quality photography, and suitable for use as a background. It should show the specific environment of the industry." \
  --command "magick '{{file}}' -resize 1024x768^ -gravity center -extent 1024x768 examples/10-image/assets/tablet_in_hands.png -gravity center -composite '{{file}}' && npx tsx src/dashboard_tablet.ts '{{file}}' 'out/10-image/{{industry}}/form_data.json' 'out/10-image/{{industry}}/01_MenuBarIcon.svg' 'example/10-image/prompt-4-booking-form-json-data/user_image.png' '{{file}}.tmp.jpg' && mv '{{file}}.tmp.jpg' '{{file}}' && magick '{{file}}' -resize 1024x1024 -quality 95 '{{file}}'"

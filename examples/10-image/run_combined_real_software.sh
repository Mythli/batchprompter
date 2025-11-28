#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv \
  examples/10-image/prompt-1-industry-image \
  examples/10-image/prompt-4-booking-form \
  --model "google/gemini-3-pro-image-preview" \
  --output-1 "out/10-image/{{industry}}/{{industry}}-real.jpg" \
  --aspect-ratio-1 "3:2" \
  --command-1 "magick '{{file}}' -resize 800x533 -quality 85 '{{file}}'" \
  --output-2 "out/10-image/{{industry}}/{{industry}}-software.jpg" \
  --aspect-ratio-2 "1:1" \
  --command-2 "magick '{{file}}' -resize 800x800 -quality 85 '{{file}}'"

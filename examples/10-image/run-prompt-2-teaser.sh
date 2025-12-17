#!/bin/bash

npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/prompt-2-teaser \
  --output "out/10-image/{{industry}}/02_HeroImage.jpg" \
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview" \
  --image-query-model "google/gemini-3-pro-preview" \
  --image-query-prompt "You are an expert at image search queries. Generate 5 English search keywords for {{industry}}. Visual Logic: If {{industry}} is specific or abstract (e.g., 'Educator Training'), do NOT search for the term. Instead, deduce the physical objects and setting (e.g., 'sandbox', 'toys'). Subject: Girl/Woman. No lighting/mood terms. Instructions: 1. (Broad Visual) 'Girl' or 'Woman' + the most basic physical object or location (e.g., 'Girl sandbox'). 2. (Generic Action) 'Woman' + simple verb (e.g., 'reading', 'steering'). 3. (Generic Setting) Subject in the typical environment. 4. (Specific Object interaction) Subject holding/using a specific tool typical for this job. 5. (Descriptive Activity) Full sentence of the woman doing the physical task. Output exactly 5 numbered English queries." \
  --image-search-query-count 5 \
  --image-select-prompt "Select the image that has a girl, 18-30 years old, as the focal person doing the core activity of {{industry}}. Avoid images with lots of people. Try to find a picture with one person only. Her face and chest must be visible. We want to capture real moments. Disqualify pictures where the focal person is a child, the picture includes a mirror, has low quality or has any visible watermarks or digitally added overlays." \
  --image-select-model "google/gemini-3-pro-preview" \
  --image-search-max-pages 1 \
  --image-search-sprite-size 6 \
  --image-search-select 6 \
  --image-search-explode \
  --candidates 2 \
  --command "magick '{{file}}' -resize 900x600 -quality 85 '{{file}}'" \

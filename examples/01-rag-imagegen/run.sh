#!/bin/bash

echo -e "industry\nSailing school" | npx tsx src/index.ts generate \
  --prompt "**Change the provided image based on the specific requirements listed below:**

**General Instructions:**
- Modify every subject to possess distinctively German facial features and styling, ensuring their ethnicity is natural to their appearance rather than relying on clothing stereotypes.
- Do not add any new people who are not in the original image.
- Do not remove existing people from the image.
- Strictly preserve the original background and maintain the gender of every subject.
- Eliminate all text overlays or graphics that appear to be digitally added in post-production.
- **Strictly maintain the exact body posture, limb and feet positioning, and arm as well as finger placement of all subjects.**
- Change the lighting to bright daylight
- Upscale the image if it is pixelated
- Leave all other visual elements strictly unchanged.
- Remove all writing, logos, or branding from clothing.
- do not change gear or tools

**Change all women in the picture:**
- Style all women as attractive **23–28-year-olds** with distinctively German features.
- Change the face of the woman to change her identity
- **Render their physiques as petite and slender, characterized by a delicate frame, narrow waist, and toned limbs.**
- **Change clothing completely. Ensure their attire is form-fitting or flattering their figure while remaining consistent with the {{industry}} environment.**
- **Depict a curvaceous, full bust proportion (C-D cup) that is prominent yet balances their slender frame.**" \
  --output "out/01-rag-imagegen/{{industry}}/HeroImage.jpg" \
  --tmp-dir "out/01-rag-imagegen/{{industry}}/.tmp/HeroImage.jpg"	\
  --aspect-ratio "3:2" \
  --model "google/gemini-3-pro-image-preview" \
  --image-query-model "google/gemini-3-flash-preview" \
  --image-select-thinking-level "high" \
  --image-query-prompt "You are an expert at image search queries. Generate 5 English search keywords for {{industry}}. Visual Logic: If {{industry}} is specific or abstract (e.g., 'Educator Training'), do NOT search for the term. Instead, deduce the physical objects and setting (e.g., 'sandbox', 'toys'). Subject: Girl/Woman. No lighting/mood terms. Instructions: 1. (Broad Visual) 'Girl' or 'Woman' + the most basic physical object or location (e.g., 'Girl sandbox'). 2. (Generic Action) 'Woman' + simple verb (e.g., 'reading', 'steering'). 3. (Generic Setting) Subject in the typical environment. 4. (Specific Object interaction) Subject holding/using a specific tool typical for this job. 5. (Descriptive Activity) Full sentence of the woman doing the physical task. Output exactly 5 numbered English queries." \
  --image-search-query-count 5 \
  --image-select-prompt "Select the best image for {{industry}} using this scoring system. For each image, calculate the total score and select the image with the highest score.

| Criterion | Points | Description |
|-----------|--------|-------------|
| Focal person is a woman 18-30 years old | +3 | The main subject is clearly a young adult woman |
| Secondary person interaction | +2 | A second person is present and interacting with the focal person |
| Core activity clearly visible | +5 | The woman is visibly performing the core activity of {{industry}} |
| Face visible | +3 | The focal person's face is clearly visible |
| Crowd of people in foreground | -3 | Multiple non-blurred people cluttering the image (blurred background people are OK) |

**Automatic Disqualification (score = 0):**
- Focal person is a child
- Image contains a mirror
- Low image quality
- Visible watermarks or digitally added overlays

Evaluate each image, calculate the score, and select the one with the highest total." \
  --image-select-model "google/gemini-3-flash-preview" \
  --image-select-thinking-level "high" \
  --image-search-max-pages 1 \
  --image-search-sprite-size 6 \
  --image-search-select 6 \
  --image-search-explode \
  --candidates 2 \
  --command "magick '{{file}}' -resize 900x600 -quality 85 '{{file}}'"

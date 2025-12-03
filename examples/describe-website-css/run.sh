#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run the batchprompt tool
# - Uses the style-scraper plugin to capture screenshots (desktop & mobile) and interactive element styles.
# - Passes these assets to GPT-4o to generate a design description.

npx tsx src/index.ts generate examples/describe-website-css/data.csv \
  "Analyze the visual style of the website based on the provided screenshots and interactive elements.

  Please provide a structured design analysis covering:
  1. **Color Palette**: Primary, secondary, and background colors.
  2. **Typography**: Font styles, weights, and hierarchy.
  3. **UI Components**: Button styles (shapes, hover effects), input fields, and shadows.
  4. **Layout & Responsiveness**: Use of whitespace, grid structure, and differences between desktop/mobile.
  5. **Overall Aesthetic**: The mood and personality of the design (e.g., minimalist, corporate, playful)." \
  --style-scrape-url "{{website_url}}" \
  --style-scrape-resolution "1920x1080" \
  --style-scrape-mobile \
  --style-scrape-interactive \
  --output "examples/describe-website-css/output/{{website_url}}.md" \
  --model "gpt-4o"

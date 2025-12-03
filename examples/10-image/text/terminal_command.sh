npx tsx src/index.ts generate \
  "examples/10-image/text/text-input/test.csv" \
  "examples/10-image/text/text-input/00_Markdown.md" \
  "examples/10-image/text/text-input/01_newFeaturesSection.md" \
  "examples/10-image/text/text-input/02_featuresSection.md" \
  "examples/10-image/text/text-input/03_yourBenefits.md" \
  "examples/10-image/text/text-input/04_aboutCourse_first_second.md" \
  "examples/10-image/text/text-input/05_heroSection.md" \
  --output "examples/10-image/text/text-output/{{id}}_{{industry}}/output.md" \
  --concurrency 10 \
  --model google/gemini-3-pro-preview
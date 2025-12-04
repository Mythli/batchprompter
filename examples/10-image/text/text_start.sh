npx tsx src/index.ts generate \
  "examples/10-image/text/test.csv" \
  "examples/10-image/text/prompts/data.json" \
  "examples/10-image/text/prompts/schema.json" \
  "examples/10-image/text/prompts/prompt.md" \
  --output "examples/10-image/text/dataout/{{industry}}.json" \
  --concurrency 10 \
  --model google/gemini-3-pro-preview

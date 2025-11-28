#!/bin/bash
chmod +x examples/11-function-icons/process_icons.sh

npx tsx src/index.ts generate examples/11-function-icons/data-real.csv examples/11-function-icons/prompt examples/11-function-icons/prompt-more.md examples/11-function-icons/prompt-more.md \
  --output "out/11-function-icons/{{section}}/{{name}}.png" \
  --aspect-ratio "1:1" \
  --model "google/gemini-3-pro-image-preview" \
  --verify-command "./examples/11-function-icons/process_icons.sh '{{file}}' '{{color}}'"

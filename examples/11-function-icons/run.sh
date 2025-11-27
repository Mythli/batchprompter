#!/bin/bash
chmod +x examples/11-function-icons/process_icons.sh

npx tsx src/index.ts generate examples/11-function-icons/data-test.csv examples/11-function-icons/prompt \
  --output "out/11-function-icons/{{section}}/{{name}}.png" \
  --aspect-ratio "1:1" \
  --model "google/gemini-3-pro-image-preview" \
  --verify-command "./examples/11-function-icons/process_icons.sh '{{file}}' '{{color}}'"

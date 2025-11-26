#!/bin/bash
npx tsx src/index.ts generate examples/10-image/data.csv examples/10-image/0-prompt-gen/prompt.md \
  --output-column-1 "software_prompt" \
  --model "gpt-4o"

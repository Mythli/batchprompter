#!/bin/bash
# Example run command for text generation
# This demonstrates:
# 1. Using multiple prompt files (prompt1.md, prompt2.md)
# 2. Using a system prompt for persona definition
# 3. Generating text output for each row in the CSV

npx tsx src/index.ts generate \
  examples/text/data.csv \
  examples/text/prompt1.md \
  examples/text/prompt2.md \
  -o out/text/{{id}}/result.txt \
  --system examples/text/system.md \
  --model google/gemini-3-pro-preview

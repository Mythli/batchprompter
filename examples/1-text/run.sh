#!/bin/bash
# Example run command for text generation
# This demonstrates:
# 1. Using multiple prompt files (prompt1.md, prompt2.md)
# 2. Using a system prompt for persona definition
# 3. Generating text output for each row in the CSV

npx tsx src/index.ts generate \
  examples/1-text/data.csv \
  examples/1-text/prompt1.md \
  examples/1-text/prompt2.md \
  -o out/1-text/{{id}}/result.txt \
  --system examples/1-text/system.md \
  --model google/gemini-3-pro-preview

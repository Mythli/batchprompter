#!/bin/bash
# Example run command for directory-based prompts
# This demonstrates:
# 1. Using a directory of prompt files (prompt/01_instruction.md, prompt/02_details.md)
# 2. Using a directory of system prompts (system/01_identity.md, system/02_tone.md)
# 3. Generating text output based on CSV data

npx tsx src/index.ts generate \
  examples/3-directory-prompt/data.csv \
  examples/3-directory-prompt/prompt \
  -o out/3-directory-prompt/{{id}}/result.txt \
  --system examples/3-directory-prompt/system \
  --model google/gemini-3-pro-preview

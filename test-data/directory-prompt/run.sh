#!/bin/bash
# Example run command for directory-based prompts
# This demonstrates:
# 1. Using a directory of prompt files (prompt/01_instruction.md, prompt/02_details.md)
# 2. Using a directory of system prompts (system/01_identity.md, system/02_tone.md)
# 3. Generating text output based on CSV data

node dist/index.js generate \
  test-data/directory-prompt/data.csv \
  test-data/directory-prompt/prompt \
  -o out/directory-prompt/{{id}}/result.txt \
  --system test-data/directory-prompt/system

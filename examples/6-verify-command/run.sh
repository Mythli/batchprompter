#!/bin/bash
# Example run command for verification command
# This demonstrates:
# 1. Generating code
# 2. Using --verify-command to run a shell script that validates the output
# 3. If the script fails, the output (stderr/stdout) is fed back to the AI to fix it.

chmod +x examples/6-verify-command/verify.sh

npx tsx src/index.ts generate \
  examples/6-verify-command/data.csv \
  examples/6-verify-command/prompt.md \
  -o out/6-verify-command/{{id}}/script.txt \
  --verify-command "examples/6-verify-command/verify.sh {{file}}" \
  --model google/gemini-3-pro-preview

#!/bin/bash
# Example run command for text generation
# This demonstrates:
# 1. Using multiple prompt files (prompt1.md, prompt2.md)
# 2. Using a system prompt for persona definition
# 3. Generating text output for each row in the CSV

node dist/index.js generate \
  test-data/text/data.csv \
  test-data/text/prompt1.md \
  test-data/text/prompt2.md \
  -o out/text/{{id}}/result.txt \
  --system test-data/text/system.md

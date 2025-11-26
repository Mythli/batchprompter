#!/bin/bash
# Example run command for dynamic prompt paths
# This demonstrates:
# 1. Using a dynamic path for the prompt file based on CSV data ({{segment}})
# 2. Loading different prompt templates for different rows

npx tsx src/index.ts generate \
  examples/2-dynamic-prompts/data.csv \
  "examples/2-dynamic-prompts/prompts/{{segment}}.md" \
  -o out/2-dynamic-prompts/{{id}}_{{segment}}.txt \
  --system examples/2-dynamic-prompts/system.md \
  --model google/gemini-3-pro-preview

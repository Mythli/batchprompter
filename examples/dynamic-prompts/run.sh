#!/bin/bash
# Example run command for dynamic prompt paths
# This demonstrates:
# 1. Using a dynamic path for the prompt file based on CSV data ({{segment}})
# 2. Loading different prompt templates for different rows

node dist/index.js generate \
  examples/dynamic-prompts/data.csv \
  "examples/dynamic-prompts/prompts/{{segment}}.md" \
  -o out/dynamic-prompts/{{id}}_{{segment}}.txt \
  --system examples/dynamic-prompts/system.md

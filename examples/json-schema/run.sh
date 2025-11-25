#!/bin/bash
# Example run command for multi-step JSON schema generation
# This demonstrates:
# Step 1: Character generation (Global Schema + Global System Prompt)
# Step 2: Weapon generation (Schema Override + System Prompt Override)

npx tsx src/index.ts generate \
  examples/json-schema/data.csv \
  examples/json-schema/prompt.md \
  examples/json-schema/prompt_2.md \
  -o out/json-schema/{{id}}/result.json \
  --schema examples/json-schema/schema.json \
  --system examples/json-schema/system.md \
  --json-schema-2 examples/json-schema/schema_2.json \
  --system-prompt-2 examples/json-schema/system_2.md \
  --model google/gemini-3-pro-preview

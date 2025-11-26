#!/bin/bash
# Example run command for multi-step JSON schema generation
# This demonstrates:
# Step 1: Character generation (Global Schema + Global System Prompt)
# Step 2: Weapon generation (Schema Override + System Prompt Override)

npx tsx src/index.ts generate \
  examples/5-json-schema/data.csv \
  examples/5-json-schema/prompt.md \
  examples/5-json-schema/prompt_2.md \
  -o out/5-json-schema/{{id}}/result.json \
  --schema examples/5-json-schema/schema.json \
  --system examples/5-json-schema/system.md \
  --json-schema-2 examples/5-json-schema/schema_2.json \
  --system-prompt-2 examples/5-json-schema/system_2.md \
  --model google/gemini-3-pro-preview

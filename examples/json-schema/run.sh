#!/bin/bash
# Example run command for multi-step JSON schema generation
# This demonstrates:
# Step 1: Character generation (Global Schema + Global System Prompt)
# Step 2: Weapon generation (Schema Override + System Prompt Override)

node dist/index.js generate \
  test-data/json-schema/data.csv \
  test-data/json-schema/prompt.md \
  test-data/json-schema/prompt_2.md \
  -o out/json-schema/{{id}}/result.json \
  --schema test-data/json-schema/schema.json \
  --system test-data/json-schema/system.md \
  --json-schema-2 test-data/json-schema/schema_2.json \
  --system-prompt-2 test-data/json-schema/system_2.md

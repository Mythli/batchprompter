#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using JSON config
echo -e "industry\nSailing school" | npx tsx src/index.ts generate --config examples/01-rag-imagegen/config.json

#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/01-rag-imagegen

# Run using config file
echo -e "industry\nSailing school" | node dist/index.js generate --config examples/01-rag-imagegen/config.json

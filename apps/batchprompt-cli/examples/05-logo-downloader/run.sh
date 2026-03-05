#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/05-logo-downloader

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <input_csv>"
    exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

# Run the batchprompt tool
cat "$INPUT_FILE" | node dist/index.js generate \
  --config examples/05-logo-downloader/config.json

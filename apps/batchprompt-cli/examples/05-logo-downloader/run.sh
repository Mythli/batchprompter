#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/05-logo-downloader

# Default to the output of the 07-analyse-customer-website example if no file is provided
INPUT_FILE="${1:-out/07-analyse-customer-website/customers_enriched.csv}"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    echo "Please run the 07-analyse-customer-website example first, or provide a valid CSV file as an argument."
    exit 1
fi

# Run the batchprompt tool
cat "$INPUT_FILE" | node dist/index.js generate \
  --config examples/05-logo-downloader/config.json

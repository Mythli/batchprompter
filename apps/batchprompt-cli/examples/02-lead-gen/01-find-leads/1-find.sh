#!/bin/bash

# This script finds and dedupes companies based on the industry and location.
# It outputs a single CSV containing all companies: out/02-lead-gen/companies.csv
# The industry column is preserved so you can filter by industry.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using config file
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <industry> <output_json>"
    exit 1
fi

INDUSTRY="$1"
OUTPUT_FILE="$2"

echo "[{\"industry\": \"$INDUSTRY\"}]" | node dist/index.js generate --config examples/02-lead-gen/config-1-find.json --data-output-path "$OUTPUT_FILE"

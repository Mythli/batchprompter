#!/bin/bash

# This script finds and dedupes companies based on the industry and location.
# It outputs a single CSV containing all companies: out/02-lead-gen/companies.csv
# The industry column is preserved so you can filter by industry.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

# Run using config file
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <industry> [additional_args...]"
    exit 1
fi

INDUSTRY="$1"
shift

BATCHPROMPT_ARGS=("$@")

echo "[{\"industry\": \"$INDUSTRY\"}]" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/01-find-leads/config-1-find.json "${BATCHPROMPT_ARGS[@]}"

# Automatically filter out existing customers
OUTPUT_FILE="out/02-lead-gen/companies.csv"
if [ -f "$OUTPUT_FILE" ]; then
    echo -e "\nFiltering existing customers..."
    node examples/02-lead-gen/01-find-leads/filter-customers.cjs "$OUTPUT_FILE" "$OUTPUT_FILE"
fi

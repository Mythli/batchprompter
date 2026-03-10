#!/bin/bash

# This script generates personalized emails for each company.
# It reads the enriched CSV and outputs markdown files.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

INPUT_FILE="out/02-lead-gen/companies_enriched.csv"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found. Please run 2-enrich.sh first."
    exit 1
fi

# Append any remaining arguments (like --input-limit 10)
BATCHPROMPT_ARGS=("$@")

cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/03-generate-email/config-4-email.json "${BATCHPROMPT_ARGS[@]}"

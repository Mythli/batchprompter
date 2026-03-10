#!/bin/bash

# This script generates personalized emails for each company.
# It reads the enriched CSV and outputs markdown files.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

# Run using config file
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <input_csv>"
    exit 1
fi

INPUT_FILE="$1"

if [[ "$INPUT_FILE" != /* ]]; then
    INPUT_FILE="$ORIG_DIR/$INPUT_FILE"
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/03-generate-email/config-4-email.json --input-limit 10

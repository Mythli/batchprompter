#!/bin/bash

# This script takes the list of companies and enriches it with contact details,
# LinkedIn profiles, and offers.

# Navigate to the project root directory
cd "$(dirname "$0")/../../.."

# Run using config file
# Input comes from the output of step 1
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <input_json> <output_csv>"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/02-enrich/config-2-enrich.json --data-output-path "$OUTPUT_FILE"

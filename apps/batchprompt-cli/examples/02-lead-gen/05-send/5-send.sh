#!/bin/bash

# This script sends emails using the gmailSender plugin.
# It reads an input CSV and outputs a CSV with the send status.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

# Run using config file
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <input_csv> <output_csv>"
    echo "Example: bash examples/02-lead-gen/05-send/5-send.sh examples/02-lead-gen/05-send/5-send-test.csv out/02-lead-gen/5-send-results.csv"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [[ "$INPUT_FILE" != /* ]]; then
    INPUT_FILE="$ORIG_DIR/$INPUT_FILE"
fi

if [[ "$OUTPUT_FILE" != /* ]]; then
    OUTPUT_FILE="$ORIG_DIR/$OUTPUT_FILE"
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

# Ensure GMAIL_EMAIL and GMAIL_PASSWORD are set in your environment or .env file
cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/05-send/config-5-send.json --data-output-path "$OUTPUT_FILE"

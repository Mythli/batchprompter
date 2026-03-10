#!/bin/bash

# This script sends emails using the gmailSender plugin.
# It reads an input CSV and outputs a CSV with the send status.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

# Run using config file
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <input_csv> [output_csv] [additional_args...]"
    echo "Example: bash examples/02-lead-gen/05-send/5-send.sh examples/02-lead-gen/05-send/5-send-test.csv out/02-lead-gen/5-send-results.csv --input-limit 5"
    exit 1
fi

INPUT_FILE="$1"
shift

if [[ "$INPUT_FILE" != /* ]]; then
    INPUT_FILE="$ORIG_DIR/$INPUT_FILE"
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

BATCHPROMPT_ARGS=()

# If the next argument exists and doesn't start with '-', treat it as the output file
if [ "$#" -gt 0 ] && [[ "$1" != -* ]]; then
    OUTPUT_FILE="$1"
    shift
    if [[ "$OUTPUT_FILE" != /* ]]; then
        OUTPUT_FILE="$ORIG_DIR/$OUTPUT_FILE"
    fi
    BATCHPROMPT_ARGS+=("--data-output-path" "$OUTPUT_FILE")
fi

# Append any remaining arguments (like --input-limit 10)
BATCHPROMPT_ARGS+=("$@")

# Ensure GMAIL_EMAIL and GMAIL_PASSWORD are set in your environment or .env file
cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/05-send/config-5-send.json "${BATCHPROMPT_ARGS[@]}"

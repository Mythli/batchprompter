#!/bin/bash

# This script sends emails using the gmailSender plugin.
# It reads an input CSV and outputs a CSV with the send status.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

# Use the test CSV file for the send step
INPUT_FILE="examples/02-lead-gen/05-send/5-send-test.csv"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

BATCHPROMPT_ARGS=("$@")

# Ensure GMAIL_EMAIL and GMAIL_PASSWORD are set in your environment or .env file
cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/05-send/config-5-send.json "${BATCHPROMPT_ARGS[@]}"

#!/bin/bash

# This script sends emails using the gmailSender plugin.
# It reads an input CSV and outputs a CSV with the send status.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <industry> [additional_args...]"
    exit 1
fi

INDUSTRY="$1"
shift

INPUT_FILE="out/02-lead-gen/companies_${INDUSTRY}_enriched.csv"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found. Please run 2-enrich.sh first."
    exit 1
fi

BATCHPROMPT_ARGS=("$@")

# Ensure GMAIL_EMAIL and GMAIL_PASSWORD are set in your environment or .env file
cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/05-send/config-5-send.json "${BATCHPROMPT_ARGS[@]}"

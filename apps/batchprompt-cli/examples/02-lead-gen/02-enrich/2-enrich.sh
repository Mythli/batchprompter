#!/bin/bash

# This script takes the list of companies and enriches it with contact details,
# LinkedIn profiles, and offers.

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

INPUT_FILE="out/02-lead-gen/companies_${INDUSTRY}.csv"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found. Please run 1-find.sh first."
    exit 1
fi

BATCHPROMPT_ARGS=("$@")

cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/02-enrich/config-2-enrich.json "${BATCHPROMPT_ARGS[@]}"

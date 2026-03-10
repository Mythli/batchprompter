#!/bin/bash

# This script takes the list of companies and enriches it with contact details,
# LinkedIn profiles, and offers.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../../.."

# Run using config file
# Input comes from the output of step 1
if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <input_json> [additional_args...]"
    exit 1
fi

INPUT_FILE="$1"
shift

if [[ "$INPUT_FILE" != /* ]]; then
    INPUT_FILE="$ORIG_DIR/$INPUT_FILE"
fi

BATCHPROMPT_ARGS=("$@")

cat "$INPUT_FILE" | bash examples/02-lead-gen/run-batchprompt.sh generate --config examples/02-lead-gen/02-enrich/config-2-enrich.json "${BATCHPROMPT_ARGS[@]}"

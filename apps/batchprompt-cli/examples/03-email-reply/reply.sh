#!/bin/bash

# This script interactively replies to unread emails using the gmailReplier plugin.
# It will pause and prompt you in the terminal to [S]end, [E]dit, [R]egenerate, or [I]gnore each draft.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_DIR="$(pwd)"

# Navigate to the project root directory
cd "$SCRIPT_DIR/../.."

BATCHPROMPT_ARGS=()

# If the first argument exists and doesn't start with '-', treat it as the output file
if [ "$#" -gt 0 ] && [[ "$1" != -* ]]; then
    OUTPUT_FILE="$1"
    shift
    if [[ "$OUTPUT_FILE" != /* ]]; then
        OUTPUT_FILE="$ORIG_DIR/$OUTPUT_FILE"
    fi
    BATCHPROMPT_ARGS+=("--data-output-path" "$OUTPUT_FILE")
fi

# Append any remaining arguments
BATCHPROMPT_ARGS+=("$@")

# Ensure GMAIL_EMAIL and GMAIL_PASSWORD are set in your environment or .env file
# We run the command directly without piping so the terminal remains interactive.
# The pipeline defaults to a single empty JSON object `[{}]` to trigger exactly one pipeline row,
# which the gmailReplier will then explode into multiple rows (one for each email processed).
node dist/index.js generate --config examples/03-email-reply/config-reply.json "${BATCHPROMPT_ARGS[@]}"

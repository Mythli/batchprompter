#!/bin/bash

# This script interactively replies to unread emails using the gmailReplier plugin.
# It will pause and prompt you in the terminal to [S]end, [E]dit, [R]egenerate, or [I]gnore each draft.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

OUTPUT_FILE="out/03-email-reply/replied_emails.csv"

# Ensure GMAIL_EMAIL and GMAIL_PASSWORD are set in your environment or .env file
# We pipe in a single empty JSON object `[{}]` to trigger exactly one pipeline row,
# which the gmailReplier will then explode into multiple rows (one for each email processed).
echo "[{}]" | node dist/index.js generate --config examples/03-email-reply/config-reply.json --data-output-path "$OUTPUT_FILE"

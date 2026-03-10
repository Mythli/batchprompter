#!/bin/bash

# Abstracted batchprompt execution
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Try current directory
if [ -f "./dist/index.js" ]; then
    node ./dist/index.js "$@"
# 2. Try script directory (relative to this script's location)
elif [ -f "$SCRIPT_DIR/../../dist/index.js" ]; then
    node "$SCRIPT_DIR/../../dist/index.js" "$@"
# 3. Try global command
elif command -v batchprompt &> /dev/null; then
    batchprompt "$@"
else
    echo "Error: batchprompt not found. Please build it or install it globally."
    exit 1
fi

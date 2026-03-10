#!/bin/bash

# Abstracted batchprompt execution
if [ -f "./dist/index.js" ]; then
    node ./dist/index.js "$@"
elif [ -f "../../dist/index.js" ]; then
    node ../../dist/index.js "$@"
elif command -v batchprompt &> /dev/null; then
    batchprompt "$@"
else
    echo "Error: batchprompt not found. Please build it or install it globally."
    exit 1
fi

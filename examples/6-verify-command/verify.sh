#!/bin/bash
# A simple verification script that checks if the file is valid code by trying to run it (or check syntax)
# For this example, we just check if the file contains "Hello World" and is not empty.
# In a real scenario, you might run 'node $1' or 'python3 -m py_compile $1'

FILE=$1

if [ ! -s "$FILE" ]; then
  echo "Error: File is empty."
  exit 1
fi

grep -q "Hello World" "$FILE"
if [ $? -ne 0 ]; then
  echo "Error: Code does not contain 'Hello World'."
  exit 1
fi

# Simulate a syntax check based on extension (naive)
if [[ "$FILE" == *".js" ]]; then
  node --check "$FILE" 2>&1
  if [ $? -ne 0 ]; then
    echo "Error: Invalid Node.js syntax."
    exit 1
  fi
fi

echo "Verification passed."
exit 0

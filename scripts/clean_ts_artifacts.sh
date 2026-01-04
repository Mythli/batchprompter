#!/bin/bash

# Find all .ts and .tsx files, excluding node_modules
# Use -print0 to handle filenames with spaces correctly
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "*/node_modules/*" -print0 | while IFS= read -r -d '' file; do
    # Strip the extension
    base="${file%.*}"
    
    # Remove corresponding compiled files
    rm -f "$base.js" "$base.js.map" "$base.d.ts" "$base.d.ts.map"
done

echo "Cleanup complete."

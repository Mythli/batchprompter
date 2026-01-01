#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/.."

OUTPUT_FILE="llms-full.txt"

# Clear or create the output file
> "$OUTPUT_FILE"

echo "Generating $OUTPUT_FILE..."

# Function to append file content with a header
append_file() {
    local file="$1"
    if [ -f "$file" ]; then
        echo "$file" >> "$OUTPUT_FILE"
        echo '````' >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo '````' >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    fi
}

# 1. Append JSON Schema (Generated)
echo "Generating JSON Schema..."
echo "schema.json" >> "$OUTPUT_FILE"
echo '````json' >> "$OUTPUT_FILE"
npx tsx src/index.ts schema >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo '````' >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# 2. Append README.md
append_file "README.md"

# 3. Find all files in examples directory and append them
find examples -type f -not -path '*/.*' | sort | while read -r file; do
    append_file "$file"
done

echo "Done! Created $OUTPUT_FILE"

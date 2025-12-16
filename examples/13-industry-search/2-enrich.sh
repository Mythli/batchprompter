#!/bin/bash

# This script takes the list of companies and enriches it with contact details,
# LinkedIn profiles, and offers.
# It iterates over all CSV files found in out/13-industry-search/ that match
# the pattern *companies*.csv or similar input files.

# Find all CSV files in the output directory (excluding already enriched files)
INPUT_DIR="out/13-industry-search"

# Check if the input directory exists
if [ ! -d "$INPUT_DIR" ]; then
    echo "Error: Input directory $INPUT_DIR does not exist."
    echo "Please run 1-find.sh first."
    exit 1
fi

# Find all CSV files, excluding *_enriched.csv and *_processed.csv
for INPUT_FILE in "$INPUT_DIR"/*.csv; do
    # Skip if no files found
    [ -e "$INPUT_FILE" ] || continue
    
    # Skip already processed files
    if [[ "$INPUT_FILE" == *"_enriched.csv" ]] || [[ "$INPUT_FILE" == *"_processed.csv" ]]; then
        echo "Skipping already processed file: $INPUT_FILE"
        continue
    fi
    
    # Generate output filename
    BASENAME=$(basename "$INPUT_FILE" .csv)
    OUTPUT_FILE="$INPUT_DIR/${BASENAME}_enriched.csv"
    
    echo ""
    echo "=========================================="
    echo "Processing: $INPUT_FILE"
    echo "Output: $OUTPUT_FILE"
    echo "=========================================="
    
    npx tsx src/index.ts generate "$INPUT_FILE" \
      \
      "" \
      --limit 2 \
      --model "google/gemini-3-pro-preview" \
      --website-agent-url-1 "{{link}}" \
      --website-agent-schema-1 examples/13-industry-search/schemas/contact.json \
      --website-agent-export-1 \
      \
      "" \
      --validate-schema-2 examples/13-industry-search/schemas/contact-validation.json \
      \
      "You are a data extraction engine. Extract the LinkedIn URL for {{decisionMaker.firstName}} {{decisionMaker.lastName}} from the search results.
Output Rules:
1. Return ONLY the URL (starting with https://).
2. If no valid personal profile is found, return an empty string.
3. Do NOT return JSON, Markdown, quotes, or explanations." \
      --web-search-query-3 "site:linkedin.com/in/ {{decisionMaker.firstName}} {{decisionMaker.lastName}} {{companyName}} -inurl:company" \
      --web-search-limit-3 5 \
      --web-select-3-prompt "Select the LinkedIn personal profile for {{decisionMaker.firstName}} {{decisionMaker.lastName}} at {{companyName}}. The URL MUST contain '/in/'. Do NOT select company pages (containing '/company/'). If the specific person is not found, do not select anything." \
      --output-column-3 "linkedinUrl" \
      \
      --tmp-dir "out/13-industry-search/.tmp" \
      --data-output "$OUTPUT_FILE"
    
    echo "Finished processing: $INPUT_FILE"
done

echo ""
echo "=========================================="
echo "All files processed!"
echo "=========================================="

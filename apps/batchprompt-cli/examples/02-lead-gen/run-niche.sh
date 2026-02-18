#!/bin/bash

# Usage: ./run-niche.sh "Industry 1" "Industry 2" ...

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <industry1> [industry2 ...]"
    exit 1
fi

OUTPUT_DIR="out/02-lead-gen"
mkdir -p "$OUTPUT_DIR"

for INDUSTRY in "$@"
do
    # Create safe filename (replace non-alphanumeric with underscore)
    SAFE_NAME=$(echo "$INDUSTRY" | sed 's/[^a-zA-Z0-9]/_/g')
    
    FIND_OUTPUT="$OUTPUT_DIR/${SAFE_NAME}_results.json"
    ENRICH_OUTPUT="$OUTPUT_DIR/${SAFE_NAME}_enriched.csv"
    
    echo "========================================"
    echo "Processing niche: $INDUSTRY"
    echo "========================================"
    
    echo "1. Finding companies..."
    bash examples/02-lead-gen/1-find.sh "$INDUSTRY" "$FIND_OUTPUT"
    
    echo "2. Enriching data..."
    bash examples/02-lead-gen/2-enrich.sh "$FIND_OUTPUT" "$ENRICH_OUTPUT"

    echo "3. Filtering existing customers..."
    node examples/02-lead-gen/filter-customers.js "$ENRICH_OUTPUT" "$ENRICH_OUTPUT"
    
    echo "Done. Results saved to $ENRICH_OUTPUT"
    echo ""
done

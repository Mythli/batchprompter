#!/bin/bash

# Output directory: out/13-industry-search/{{industry}}/
# Each industry in the CSV gets its own folder:
# - Step 1 (find): out/13-industry-search/{{industry}}/companies.csv
# - Step 2 (enrich): out/13-industry-search/{{industry}}/enriched.csv
# - Temp files: out/13-industry-search/{{industry}}/.tmp/

# 1. Find and dedupe companies
echo "Running Step 1: Finding companies..."
echo "Output: out/13-industry-search/{{industry}}/companies.csv"
bash examples/13-industry-search/1-find.sh

# 2. Enrich with contact info, LinkedIn, and offers
echo ""
echo "Running Step 2: Enriching data..."
echo "Output: out/13-industry-search/{{industry}}/enriched.csv"
bash examples/13-industry-search/2-enrich.sh

echo ""
echo "Done! Results saved to out/13-industry-search/{{industry}}/"

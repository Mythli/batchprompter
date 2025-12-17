#!/bin/bash

# Output directory: out/13-industry-search/
# 
# Data flow:
# - Step 1 (find): out/13-industry-search/companies.csv (all industries)
# - Step 2 (enrich): out/13-industry-search/enriched.csv (all industries)
# - Temp files: out/13-industry-search/.tmp/
#
# The 'industry' column is preserved in the output CSV, so you can filter by industry.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# 1. Find and dedupe companies
echo "Running Step 1: Finding companies..."
echo "Output: out/13-industry-search/companies.csv"
bash examples/13-industry-search/1-find.sh

# 2. Enrich with contact info, LinkedIn, and offers
echo ""
echo "Running Step 2: Enriching data..."
echo "Output: out/13-industry-search/enriched.csv"
bash examples/13-industry-search/2-enrich.sh

echo ""
echo "Done! Results saved to out/13-industry-search/"
echo "Filter by 'industry' column to view results per industry."

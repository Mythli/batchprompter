#!/bin/bash

# Output directory: out/02-lead-gen/
# 
# Data flow:
# - Step 1 (find): out/02-lead-gen/companies.json (all industries)
# - Step 2 (enrich): out/02-lead-gen/companies_enriched.csv (all industries)
# - Temp files: out/02-lead-gen/.tmp/
#
# The 'industry' column is preserved in the output, so you can filter by industry.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/02-lead-gen

# 1. Find and dedupe companies
echo "Running Step 1: Finding companies..."
echo "Output: out/02-lead-gen/companies.json"
bash examples/02-lead-gen/1-find.sh

# 2. Enrich with contact info, LinkedIn, and offers
echo ""
echo "Running Step 2: Enriching data..."
echo "Output: out/02-lead-gen/companies_enriched.csv"
bash examples/02-lead-gen/2-enrich.sh

echo ""
echo "Done! Results saved to out/02-lead-gen/"
echo "Filter by 'industry' column to view results per industry."

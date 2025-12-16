#!/bin/bash

# This script takes the list of companies and enriches it with contact details,
# LinkedIn profiles, and offers.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using JSON config
npx tsx src/index.ts generate --config examples/13-industry-search/config-enrich.json

echo ""
echo "Done! Results saved to out/13-industry-search/companies_enriched.csv"

#!/bin/bash

# This script takes the list of companies and enriches it with contact details,
# LinkedIn profiles, and offers.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using JSON config
# Input comes from the output of step 1
cat out/13-industry-search/companies.csv | npx tsx src/index.ts generate --config examples/02-lead-gen/2-enrich.json

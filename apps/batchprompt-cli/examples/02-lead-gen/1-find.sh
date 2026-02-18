#!/bin/bash

# This script finds and dedupes companies based on the industry and location.
# It outputs a single CSV containing all companies: out/02-lead-gen/companies.csv
# The industry column is preserved so you can filter by industry.

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using config file
cat /Users/tobiasanhalt/Development/batchprompt/apps/batchprompt-cli/examples/02-lead-gen/focus-nische.csv | node dist/index.js generate --config examples/02-lead-gen/config-1-find.json

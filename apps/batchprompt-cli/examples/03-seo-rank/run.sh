#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/03-seo-rank

# Run using config file
cat examples/03-seo-rank/data.csv | node dist/index.js generate --config examples/03-seo-rank/config.json --limit 5

echo ""
echo "Done! Results saved to out/03-seo-rank/results.csv"

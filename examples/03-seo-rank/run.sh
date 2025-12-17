#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using JSON config
cat examples/03-seo-rank/data.csv | npx tsx src/index.ts generate --config examples/03-seo-rank/config.json

echo ""
echo "Done! Results saved to out/14-grank/results.csv"

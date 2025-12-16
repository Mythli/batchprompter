#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run using JSON config
npx tsx src/index.ts generate --config examples/14-grank/config.json

echo ""
echo "Done! Results saved to out/14-grank/results.csv"

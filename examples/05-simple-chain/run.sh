#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/05-simple-chain

# Run using config file
cat examples/05-simple-chain/data.csv | npx tsx src/index.ts generate --config examples/05-simple-chain/config.json

echo ""
echo "Done! Results saved to out/05-simple-chain/results.csv"

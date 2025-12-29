#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

# Run the batchprompt tool
cat examples/05-logo-downloader/data.csv | npx tsx src/index.ts generate \
  --config examples/05-logo-downloader/config.json \
  --output "out/05-logo-downloader/results.json"

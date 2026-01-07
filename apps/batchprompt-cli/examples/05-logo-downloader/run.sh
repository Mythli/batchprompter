#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/../.."

rm -rf out/05-logo-downloader

# Run the batchprompt tool
cat examples/05-logo-downloader/data.csv | node dist/index.js generate \
  --config examples/05-logo-downloader/config.json

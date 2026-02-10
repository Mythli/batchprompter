#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Navigate to the project root directory
cd "$(dirname "$0")/.."

echo "=========================================="
echo "Skipping Example 01: RAG Image Generation"
echo "(Requires image-search plugin - not yet available)"
echo "=========================================="

echo ""
echo "=========================================="
echo "Running Example 02: Lead Generation"
echo "=========================================="
bash examples/02-lead-gen/run.sh

echo ""
echo "=========================================="
echo "Running Example 03: SEO Rank Tracker"
echo "=========================================="
bash examples/03-seo-rank/run.sh

echo ""
echo "=========================================="
echo "Skipping Example 04: Website Style Analysis"
echo "(Requires style-scraper plugin - not yet available)"
echo "=========================================="

echo ""
echo "=========================================="
echo "Running Example 05: Simple Chain (3 Steps)"
echo "=========================================="
bash examples/05-simple-chain/run.sh

echo ""
echo "=========================================="
echo "Skipping Example 05: Logo Downloader"
echo "(Requires logo-scraper plugin - not yet available)"
echo "=========================================="

echo ""
echo "All available examples finished successfully!"

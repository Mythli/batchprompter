#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Navigate to the project root directory
cd "$(dirname "$0")/.."

echo "=========================================="
echo "Skipping Example 01: RAG Image Generation"
echo "(Available, but skipped by default because it uses image search and image generation)"
echo "=========================================="

echo ""
echo "=========================================="
echo "Skipping Example 02: Lead Generation"
echo "(Multi-step outreach workflow; follow examples/02-lead-gen/README.md)"
echo "=========================================="

echo ""
echo "=========================================="
echo "Running Example 03: SEO Rank Tracker"
echo "=========================================="
bash examples/03-seo-rank/run.sh

echo ""
echo "=========================================="
echo "Skipping Example 04: Website Style Analysis"
echo "(Available, but skipped by default because it uses browser scraping and vision)"
echo "=========================================="

echo ""
echo "=========================================="
echo "Running Example 05: Simple Chain"
echo "=========================================="
bash examples/05-simple-chain/run.sh

echo ""
echo "=========================================="
echo "Skipping Example 05: Logo Downloader"
echo "(Available, but skipped by default because it uses browser scraping and vision)"
echo "=========================================="

echo ""
echo "All available examples finished successfully!"

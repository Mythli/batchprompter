#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "=========================================="
echo "Running Example 01: RAG Image Generation"
echo "=========================================="
bash examples/01-rag-imagegen/run.sh

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
echo "Running Example 04: Website Style Analysis"
echo "=========================================="
bash examples/04-describe-website-css/run.sh

echo ""
echo "All examples finished successfully!"

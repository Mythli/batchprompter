#!/bin/bash

# 1. Find and dedupe companies
echo "Running Step 1: Finding companies..."
bash examples/13-industry-search/1-find.sh

# 2. Enrich with contact info, LinkedIn, and offers
echo "Running Step 2: Enriching data..."
bash examples/13-industry-search/2-enrich.sh

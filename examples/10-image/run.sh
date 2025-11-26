#!/bin/bash
# Master script to run all 3 image generation tasks sequentially
# Assumes execution from project root

echo "Running 1-real..."
./examples/10-image/run_1_real.sh

echo "Running 2-software..."
./examples/10-image/run_2_software.sh

echo "Running 3-icon..."
./examples/10-image/run_3_icon.sh

echo "All done."

#!/bin/bash
# Master script to run all 3 image generation tasks sequentially

echo "Running 1-real..."
./run_1_real.sh

echo "Running 2-software..."
./run_2_software.sh

echo "Running 3-icon..."
./run_3_icon.sh

echo "All done."

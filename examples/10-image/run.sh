#!/bin/bash
# Master script to run all image generation tasks sequentially
# Assumes execution from project root

echo "Running 0-prompt-gen (Software)..."
./examples/10-image/run_0_prompt_gen.sh

echo "Running 0b-prompt-gen (Real Scene)..."
./examples/10-image/run_0b_real_prompt_gen.sh

echo "Running 1-real..."
./examples/10-image/run_1_real.sh

echo "Running 2-software..."
./examples/10-image/run_2_software.sh

echo "Running 3-icon..."
./examples/10-image/run_3_icon.sh

echo "All done."

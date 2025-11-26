#!/bin/bash
# Master script to run all 3 image generation tasks sequentially

echo "Running 1-real..."
(cd 1-real && ./run.sh)

echo "Running 2-software..."
(cd 2-software && ./run.sh)

echo "Running 3-icon..."
(cd 3-icon && ./run.sh)

echo "All done."

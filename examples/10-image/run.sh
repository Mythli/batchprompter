#!/bin/bash
rm -rf out/10-image
rm -rf out/10-image-candidates

# Master script to run all image generation tasks sequentially
# Assumes execution from project root

#echo "Running 1-real..."
#./examples/10-image/run-prompt-2-teaser.sh
#./examples/10-image/run-prompt-3-teaser2.sh

##echo "Running 1b-json-gen..."
./examples/10-image/run-prompt-4-booking-form-json-data.sh
###
###echo "Running 2-software..."
./examples/10-image/run-prompt-4-booking-form.sh
#./examples/10-image/run-prompt-6-dashboard.sh
###
#echo "Running 3-icon..."
./examples/10-image/run-10-icon.sh

echo "All done."

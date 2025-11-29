#!/bin/bash
rm -rf out/10-image
rm -rf out/10-image-candidates

# Master script to run all image generation tasks sequentially
# Assumes execution from project root

# 1. Generate Data (JSON)
echo "Running 1-json-gen..."
./examples/10-image/run-prompt-4-booking-form-json-data.sh

# 2. Generate Icon (Needed for the booking form)
echo "Running 2-icon..."
./examples/10-image/run-10-icon.sh

# 3. Generate Booking Form (Uses JSON and Icon)
echo "Running 3-booking-form..."
./examples/10-image/run-prompt-4-booking-form.sh

echo "All done."

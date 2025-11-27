#!/bin/bash
set -e
set -x

# The input file path passed by BatchPrompt (e.g., "out/icon.png")
INPUT_FILE="$1"
TARGET_COLOR="$2"

# Get the base path without extension (e.g., "out/icon")
BASE_NAME="${INPUT_FILE%.*}"

# 1. Remove White Background (High Fuzz for Black/White) & Colorize
# Saves as: out/icon-transparent.png
# We use -colorize 100% to turn the black pixels into the target color.
# Since we remove white first, only the icon remains to be colorized.
magick "$INPUT_FILE" -fuzz 90% -transparent white -fill "$TARGET_COLOR" -colorize 100% "${BASE_NAME}-transparent.png"

# 2. Compress the Transparent Image
# Saves as: out/icon-transparent-compressed.png
pngquant 2 --nofs --force --output "${BASE_NAME}-transparent-compressed.png" "${BASE_NAME}-transparent.png"

#!/bin/bash
set -e

# The input file path passed by BatchPrompt (e.g., "out/icon.png")
INPUT_FILE="$1"

# Get the base path without extension (e.g., "out/icon")
BASE_NAME="${INPUT_FILE%.*}"

# 1. Remove White Background
# Saves as: out/icon-transparent.png
magick "$INPUT_FILE" -fuzz 90% -transparent white "${BASE_NAME}-transparent.png"

# 2. Compress the Transparent Image
# Saves as: out/icon-transparent-compressed.png
pngquant 2 --nofs --force --output "${BASE_NAME}-transparent-compressed.png" "${BASE_NAME}-transparent.png"

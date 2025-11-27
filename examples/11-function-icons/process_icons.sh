#!/bin/bash
set -e
set -x

# The input file path passed by BatchPrompt (e.g., "out/icon.png")
INPUT_FILE="$1"
TARGET_COLOR="$2"

# Get the base path without extension (e.g., "out/icon")
BASE_NAME="${INPUT_FILE%.*}"

# 1. Remove White Background & Colorize with Edge Smoothing
# We use an alpha mask approach instead of simple transparency to preserve anti-aliasing.
# Steps:
# 1. Load image, convert to gray, negate (Black->White/Opaque, White->Black/Transparent).
# 2. Blur the mask slightly (0x1) to smooth jagged edges.
# 3. Level (20%,100%) to clean up background noise (ensure white bg becomes fully transparent).
# 4. Create a solid color layer of TARGET_COLOR.
# 5. Apply the mask to the color layer.
magick "$INPUT_FILE" \
    -colorspace gray \
    -negate \
    -blur 0x1 \
    -level 20%,100% \
    \( +clone -fill "$TARGET_COLOR" -colorize 100% \) \
    +swap \
    -alpha off -compose CopyOpacity -composite \
    "${BASE_NAME}-transparent.png"

# 2. Compress the Transparent Image
# Saves as: out/icon-transparent-compressed.png
pngquant 2 --nofs --force --output "${BASE_NAME}-transparent-compressed.png" "${BASE_NAME}-transparent.png"

#!/bin/bash
set -e
set -x

# The input file path passed by BatchPrompt (e.g., "out/icon.png")
INPUT_FILE="$1"
TARGET_COLOR="$2"

# Get the base path without extension (e.g., "out/icon")
BASE_NAME="${INPUT_FILE%.*}"

# 1. Create the Alpha Mask
# Input: Black Icon on White BG.
# We want: White Icon (Opaque) on Black BG (Transparent).
# -colorspace gray: Ensure it's grayscale.
# -negate: Invert colors (Black->White, White->Black).
# -blur 0x1: Smooth the edges.
# -level 50%,100%: Increase contrast to clean up the background.
magick "$INPUT_FILE" \
    -colorspace gray \
    -negate \
    -blur 0x1 \
    -level 50%,100% \
    "${BASE_NAME}-mask.png"

# 2. Apply Mask to Color
# We create a solid color image and apply the mask to its alpha channel.
# -colorspace sRGB ensures we output a colored image, not grayscale.
magick "${BASE_NAME}-mask.png" \
    -colorspace sRGB \
    \( +clone -fill "$TARGET_COLOR" -colorize 100% \) \
    +swap \
    -alpha off -compose CopyOpacity -composite \
    "${BASE_NAME}-transparent.png"

# 3. Compress the Transparent Image
# Saves as: out/icon-transparent-compressed.png
pngquant 2 --nofs --force --output "${BASE_NAME}-transparent-compressed.png" "${BASE_NAME}-transparent.png"

# Cleanup intermediate mask
rm "${BASE_NAME}-mask.png"

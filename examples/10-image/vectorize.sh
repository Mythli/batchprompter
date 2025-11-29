#!/bin/bash

# Usage: ./vectorize.sh <input_image> [output_svg]
# Example: ./vectorize.sh mylogo.png mylogo.svg

set -e
set -x

# Check for API Key
if [ -z "$FAL_KEY" ]; then
    echo "Error: FAL_KEY environment variable is not set."
    echo "Please export FAL_KEY='your_api_key'"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [ -z "$INPUT_FILE" ]; then
    echo "Usage: $0 <input_image> [output_svg]"
    exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found."
    exit 1
fi

# Determine output filename if not provided
if [ -z "$OUTPUT_FILE" ]; then
    FILENAME=$(basename "$INPUT_FILE")
    OUTPUT_FILE="${FILENAME%.*}.svg"
fi

echo "Processing $INPUT_FILE -> $OUTPUT_FILE"

# 1. Upload image to a temporary host (0x0.st)
# fal.ai requires a public URL for the input image.
echo "Uploading image to temporary storage..."
# Using 0x0.st for temporary hosting
IMAGE_URL=$(curl -s -F "file=@$INPUT_FILE" https://0x0.st)

if [ -z "$IMAGE_URL" ]; then
    echo "Error: Failed to upload image."
    exit 1
fi

# Trim whitespace just in case
IMAGE_URL=$(echo "$IMAGE_URL" | tr -d '[:space:]')

# Check if we got a valid URL
if [[ ! "$IMAGE_URL" =~ ^http ]]; then
    echo "Error: Upload failed. Response: $IMAGE_URL"
    exit 1
fi

echo "Image uploaded: $IMAGE_URL"

# 2. Submit request to Fal.ai
echo "Submitting vectorization request..."
RESPONSE=$(curl -s --request POST \
  --url https://queue.fal.run/fal-ai/recraft/vectorize \
  --header "Authorization: Key $FAL_KEY" \
  --header "Content-Type: application/json" \
  --data "{\"image_url\": \"$IMAGE_URL\"}")

# Extract Request ID
# Using grep/sed to avoid dependency on jq
REQUEST_ID=$(echo "$RESPONSE" | grep -o '"request_id": *"[^"]*"' | sed 's/"request_id": *//; s/"//g')

if [ -z "$REQUEST_ID" ]; then
    echo "Error: Failed to get request ID."
    echo "Response: $RESPONSE"
    exit 1
fi

echo "Request ID: $REQUEST_ID"

# 3. Poll for completion
echo "Waiting for result..."
while true; do
    STATUS_RESPONSE=$(curl -s --request GET \
      --url "https://queue.fal.run/fal-ai/recraft/requests/$REQUEST_ID/status" \
      --header "Authorization: Key $FAL_KEY")

    # Extract status
    STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status": *"[^"]*"' | sed 's/"status": *//; s/"//g')

    if [ "$STATUS" == "COMPLETED" ]; then
        break
    elif [ "$STATUS" == "FAILED" ]; then
        echo "Error: Vectorization failed."
        echo "Status Response: $STATUS_RESPONSE"
        exit 1
    fi

    # Wait a bit before polling again
    sleep 1
    echo -n "."
done
echo ""

# 4. Get the result
RESULT_RESPONSE=$(curl -s --request GET \
  --url "https://queue.fal.run/fal-ai/recraft/requests/$REQUEST_ID" \
  --header "Authorization: Key $FAL_KEY")

# Extract SVG URL
# The response structure is {"image": {"url": "...", ...}}
SVG_URL=$(echo "$RESULT_RESPONSE" | grep -o '"url": *"[^"]*"' | head -1 | sed 's/"url": *//; s/"//g')

if [ -z "$SVG_URL" ]; then
    echo "Error: Could not find SVG URL in response."
    echo "Response: $RESULT_RESPONSE"
    exit 1
fi

echo "Downloading SVG..."
curl -s -L -o "$OUTPUT_FILE" "$SVG_URL"

echo "Done! Saved to $OUTPUT_FILE"

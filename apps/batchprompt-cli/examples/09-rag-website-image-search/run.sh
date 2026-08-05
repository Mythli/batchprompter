#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."

EXAMPLE_DIR="examples/09-rag-website-image-search"
DATA_FILE="${DATA_FILE:-$EXAMPLE_DIR/data/schwimmschule-bavaria-courses.json}"
OUTPUT_DIR="${OUTPUT_DIR:-out/09-rag-website-image-search}"
VARIANTS="${VARIANTS:-all}"

FORWARDED_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --variants)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --variants" >&2
        exit 1
      fi
      VARIANTS="$2"
      shift 2
      ;;
    --variants=*)
      VARIANTS="${1#*=}"
      shift
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done

DEFAULT_CONFIG_FILES=(
  "$EXAMPLE_DIR/config.emotional-hero.json"
  "$EXAMPLE_DIR/config.success-badge.json"
  "$EXAMPLE_DIR/config.group-background.json"
)

if [[ -n "${CONFIG_FILE:-}" && "$VARIANTS" == "all" ]]; then
  CONFIG_FILES=("$CONFIG_FILE")
elif [[ "$VARIANTS" == "all" || -z "$VARIANTS" ]]; then
  CONFIG_FILES=("${DEFAULT_CONFIG_FILES[@]}")
else
  CONFIG_FILES=()
  IFS=',' read -r -a SELECTED_VARIANTS <<< "$VARIANTS"
  for RAW_VARIANT in "${SELECTED_VARIANTS[@]}"; do
    VARIANT="${RAW_VARIANT//[[:space:]]/}"
    case "$VARIANT" in
      emotional-hero|emotional|hero)
        CONFIG_FILES+=("$EXAMPLE_DIR/config.emotional-hero.json")
        ;;
      success-badge|success|badge)
        CONFIG_FILES+=("$EXAMPLE_DIR/config.success-badge.json")
        ;;
      group-background|group|background)
        CONFIG_FILES+=("$EXAMPLE_DIR/config.group-background.json")
        ;;
      *)
        echo "Unknown variant: $VARIANT" >&2
        echo "Valid variants: emotional-hero, success-badge, group-background, all" >&2
        exit 1
        ;;
    esac
  done
fi

rm -rf "$OUTPUT_DIR"

for CONFIG in "${CONFIG_FILES[@]}"; do
  cat "$DATA_FILE" | node dist/index.js generate --config "$CONFIG" "${FORWARDED_ARGS[@]}"
done

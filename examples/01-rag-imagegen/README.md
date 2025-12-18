# RAG Image Generation Example

This example demonstrates how to use `batchprompt` to generate images based on industry-specific data, using a Retrieval-Augmented Generation (RAG) approach for image search and selection.

## Overview

The pipeline performs the following steps for each input row (industry):

1.  **Image Search (RAG):**
    *   Generates search queries based on the industry.
    *   Searches for images using Google Serper.
    *   Uses an LLM to select the best reference image from the search results based on specific criteria.
2.  **Image Generation:**
    *   Uses an image generation model (e.g., `google/gemini-3-pro-image-preview`) to modify the selected reference image according to a detailed prompt.
3.  **Post-Processing:**
    *   Resizes and optimizes the generated image using ImageMagick.

## Prerequisites

*   **Node.js:** Ensure you have Node.js installed.
*   **ImageMagick:** Required for the post-processing command (`magick`). Install via `brew install imagemagick` (macOS) or `sudo apt-get install imagemagick` (Linux).
*   **API Keys:**
    *   `BATCHPROMPT_OPENAI_API_KEY` (or `OPENAI_API_KEY`): For the LLM.
    *   `BATCHPROMPT_SERPER_API_KEY` (or `SERPER_API_KEY`): For Google Serper image search.

## Usage

1.  Navigate to the project root.
2.  Run the example script:

```bash
bash examples/01-rag-imagegen/run.sh
```

## Input Data

The input is piped into the command via `echo` in the `run.sh` script:

```csv
industry
Sailing school
```

You can modify this to pipe a CSV file instead:

```bash
cat my_industries.csv | npx tsx src/index.ts generate ...
```

## Configuration Details

The `run.sh` script uses the following flags to configure the pipeline:

*   `--prompt`: The main prompt for image generation/modification.
*   `--output`: The output path template for the generated image.
*   `--aspect-ratio`: Sets the aspect ratio for the generated image.
*   `--model`: The model used for image generation.
*   `--image-query-model`: The model used to generate search queries.
*   `--image-query-prompt`: Instructions for generating search queries.
*   `--image-search-query-count`: Number of search queries to generate.
*   `--image-select-prompt`: Criteria for selecting the best reference image.
*   `--image-select-model`: The model used to select the reference image.
*   `--image-search-max-pages`: Max search result pages to fetch.
*   `--image-search-sprite-size`: Grid size for presenting images to the selection model.
*   `--image-search-select`: Number of images to select.
*   `--image-search-explode`: Explodes the results if multiple images are selected (creates one output row per selected image).
*   `--candidates`: Number of image variations to generate.
*   `--command`: Shell command to run after generation (ImageMagick resizing).

## Output

The generated images will be saved in `out/01-rag-imagegen/{industry}/HeroImage.jpg`.

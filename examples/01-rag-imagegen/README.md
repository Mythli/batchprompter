# RAG Image Generation Tutorial

This tutorial shows how to build a **Retrieval-Augmented Generation (RAG)** pipeline for images. Instead of generating images from scratch with a simple prompt, this pipeline first searches for real-world reference images, selects the best one using AI, and then uses that reference to guide the generation of a new, high-quality image.

## 🎯 Goal
Generate a photorealistic "Hero Image" for a specific industry (e.g., "Sailing School") that adheres to strict brand guidelines (German features, specific lighting, no text).

## 🧩 The Pipeline

1.  **Query Generation**: The AI creates 5 different search queries to find diverse reference images for the industry.
2.  **Visual Search**: It searches Google Images and retrieves candidates.
3.  **AI Selection**: A Vision Model reviews the candidates against a scoring rubric (e.g., "Must be a woman", "Face visible") and picks the winner.
4.  **Image-to-Image Generation**: The winning image is passed to the generation model as a reference to ensure the pose and composition are realistic.
5.  **Post-Processing**: The final image is resized using ImageMagick.

## 🛠️ The Command Explained

The logic is defined entirely via CLI flags in `run.sh`. Here is what they do:

### 1. Search & Retrieval (RAG)
These flags control how we find the reference image.

*   `--image-query-prompt "..."`: Instructions for the AI to generate search keywords (e.g., "Girl sandbox" instead of just "Kindergarten").
*   `--image-search-query-count 5`: We generate 5 distinct search queries to cast a wide net.
*   `--image-search-max-pages 1`: We fetch the first page of results for each query.
*   `--image-select-prompt "..."`: **The Judge.** This prompt contains a scoring table (e.g., "+5 points if core activity visible"). The AI uses this to look at the search results and pick the single best image.
*   `--image-search-sprite-size 6`: To save tokens, we stitch 6 images into one "sprite" sheet before sending them to the Vision Model for selection.
*   `--image-search-select 6`: We keep the top 6 images (though usually, we just want the best one for the next step).
*   `--image-search-explode`: **Crucial.** This turns the selected images into separate processing tasks. If 1 image is selected, the pipeline continues with that 1 image context.

### 2. Generation
*   `--model "google/gemini-3-pro-image-preview"`: The model used for the actual image generation.
*   `--prompt "..."`: The detailed instructions for the generation. Note that because we used `--image-search`, the selected reference image is automatically passed to this model as context.
*   `--candidates 2`: We generate 2 variations of the final image.

### 3. Post-Processing
*   `--command "magick ..."`: A shell command that runs after the file is saved. We use `magick` (ImageMagick) to resize the output to 900x600.

## 🚀 Running the Example

1.  **Install ImageMagick** (Required for the final step):
    *   macOS: `brew install imagemagick`
    *   Linux: `sudo apt-get install imagemagick`
2.  **Set API Keys**:
    ```bash
    export BATCHPROMPT_OPENAI_API_KEY="sk-..."
    export BATCHPROMPT_SERPER_API_KEY="..."
    ```
3.  **Run**:
    ```bash
    bash examples/01-rag-imagegen/run.sh
    ```

The result will be saved to `out/01-rag-imagegen/Sailing school/HeroImage.jpg`.

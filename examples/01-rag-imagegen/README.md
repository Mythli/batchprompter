# RAG Image Generation Tutorial

This tutorial shows how to build a **Retrieval-Augmented Generation (RAG)** pipeline for images. Instead of generating images from scratch with a simple prompt, this pipeline first searches for real-world reference images, selects the best one using AI, and then uses that reference to guide the generation of a new, high-quality image.

> **💡 Tip:** This tutorial is the primary reference for understanding and configuring the **Image Search Plugin**.

## 🎯 Goal
Generate a photorealistic "Hero Image" for a specific industry (e.g., "Sailing School") that adheres to strict brand guidelines (German features, specific lighting, no text).

## 🧩 The Pipeline

1.  **Query Generation**: The AI creates 5 different search queries to find diverse reference images for the industry.
2.  **Visual Search**: It searches Google Images and retrieves candidates.
3.  **AI Selection**: A Vision Model reviews the candidates against a scoring rubric (e.g., "Must be a woman", "Face visible") and picks the winner.
4.  **Image-to-Image Generation**: The winning image is passed to the generation model as a reference to ensure the pose and composition are realistic.
5.  **Post-Processing**: The final image is resized using ImageMagick.

## 🛠️ The Command Explained

The logic is defined entirely via CLI flags in `run.sh`. Here is a breakdown of the flags used:

### 1. Search & Retrieval (RAG)
These flags control how we find the reference image.

| Flag | Value in Example | Description |
| :--- | :--- | :--- |
| `--image-query-prompt` | *"You are an expert..."* | Instructions for the AI to generate search keywords (e.g., "Girl sandbox" instead of just "Kindergarten"). |
| `--image-search-query-count` | `5` | We generate 5 distinct search queries to cast a wide net. |
| `--image-search-max-pages` | `1` | We fetch the first page of results for each query. |
| `--image-select-prompt` | *"Select the best image..."* | **The Judge.** This prompt contains a scoring table (e.g., "+5 points if core activity visible"). The AI uses this to look at the search results and pick the single best image. |
| `--image-search-sprite-size` | `6` | To save tokens, we stitch 6 images into one "sprite" sheet before sending them to the Vision Model for selection. |
| `--image-search-select` | `6` | We keep the top 6 images (though usually, we just want the best one for the next step). |
| `--image-search-explode` | (Present) | **With flag:** Splits the selected images into separate processing tasks (one per image). The generation model runs multiple times, each with a single reference image.<br><br>**Without flag:** All selected images are passed to the generation model in a single context. The model runs once, seeing all references at the same time. |

### 💥 Understanding `explode`

This example uses `--image-search-explode`. It changes the pipeline flow significantly:

| Mode | Behavior | Result | Cost |
| :--- | :--- | :--- | :--- |
| **With Explode** | The 6 selected reference images are split into **6 separate tasks**. | You get **6 output images**. Each generated image is influenced by exactly *one* reference image. | Higher (6x generations) |
| **Without Explode** | The 6 reference images are kept together in the context. | You get **1 output image**. The AI sees *all 6 references* at once and synthesizes them into one result. | Lower (1x generation) |

#### 🤖 How the Image Search Plugin Works Internally
The plugin employs a **Visual RAG (Retrieval-Augmented Generation)** strategy:

1.  **Generate Queries:** An LLM creates diverse search terms (e.g., "Sailing boat close up", "Sailing instructor teaching") to find a wide range of visual references.
2.  **Scatter (Search):** It executes these searches in parallel using Google Images.
3.  **Sprite Generation:** To efficiently process many images with a Vision Model, the plugin stitches the search results into a single **Sprite Sheet** (a grid of images). This drastically reduces token usage and latency compared to sending individual image files.
4.  **Visual Selection:** The Vision Model (The Judge) looks at the sprite sheet. It uses your `selectPrompt` (the scoring rubric) to identify the specific image index that best matches your criteria.
5.  **Context Injection:** The high-resolution version of the winning image is retrieved and injected into the context of the final Image Generation model, ensuring the output follows the reference's composition and style.

#### ⚙️ Image Search Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "type": {
      "const": "image-search",
      "description": "Must be 'image-search'"
    },
    "query": {
      "type": "string",
      "description": "Static search query. Supports Handlebars (e.g., '{{industry}}')."
    },
    "limit": {
      "type": "integer",
      "default": 12,
      "description": "Max total images to fetch."
    },
    "select": {
      "type": "integer",
      "default": 1,
      "description": "Number of images to select after filtering."
    },
    "queryCount": {
      "type": "integer",
      "default": 3,
      "description": "Number of search queries to generate (if using query model)."
    },
    "spriteSize": {
      "type": "integer",
      "default": 4,
      "description": "Number of images per sprite sheet for LLM selection."
    },
    "maxPages": {
      "type": "integer",
      "default": 1,
      "description": "Max pages of search results to fetch per query."
    },
    "dedupeStrategy": {
      "enum": ["none", "domain", "url"],
      "default": "url",
      "description": "Deduplication strategy."
    },
    "gl": {
      "type": "string",
      "description": "Google Search country code (e.g. 'de', 'us')."
    },
    "hl": {
      "type": "string",
      "description": "Google Search language code (e.g. 'de', 'en')."
    },
    "queryModel": {
      "type": "string",
      "description": "Model used to generate search queries."
    },
    "queryThinkingLevel": {
      "enum": ["low", "medium", "high"],
      "description": "Reasoning effort for the query model."
    },
    "queryTemperature": {
      "type": "number",
      "description": "Temperature for the query model."
    },
    "queryPrompt": {
      "type": "string",
      "description": "Instructions for generating search queries."
    },
    "selectModel": {
      "type": "string",
      "description": "Vision model used to select the best images."
    },
    "selectThinkingLevel": {
      "enum": ["low", "medium", "high"],
      "description": "Reasoning effort for the selection model."
    },
    "selectTemperature": {
      "type": "number",
      "description": "Temperature for the selection model."
    },
    "selectPrompt": {
      "type": "string",
      "description": "Criteria for selecting the best images."
    }
  },
  "required": ["type"]
}
```

### 2. Generation

| Flag | Value in Example | Description |
| :--- | :--- | :--- |
| `--model` | `google/gemini-3-pro-image-preview` | The model used for the actual image generation. |
| `--prompt` | *"Change the provided image..."* | The detailed instructions for the generation. Note that because we used `--image-search`, the selected reference image is automatically passed to this model as context. |
| `--candidates` | `2` | We generate 2 variations of the final image. |

### 3. Post-Processing

| Flag | Value in Example | Description |
| :--- | :--- | :--- |
| `--command` | `magick ...` | A shell command that runs after the file is saved. We use `magick` (ImageMagick) to resize the output to 900x600. |

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

The results will be saved to `out/01-rag-imagegen/Sailing school/`.

Because we use **Explode** (6 reference images) and **Candidates** (2 variations per reference), you will get multiple files named with the pattern `HeroImage_{refIndex}_{candidateIndex}.jpg`:

*   `HeroImage_0_1.jpg`
*   `HeroImage_0_2.jpg`
*   ...
*   `HeroImage_5_1.jpg`
*   `HeroImage_5_2.jpg`

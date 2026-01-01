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

## ⚙️ Configuration

The pipeline is defined in `config.json`.

### 1. Search & Retrieval (RAG)
The `image-search` plugin handles the finding and selecting of reference images.

```json
{
  "type": "image-search",
  "queryModel": "google/gemini-3-flash-preview",
  "queryPrompt": { "file": "examples/01-rag-imagegen/query-prompt.md" },
  "queryCount": 5,
  "selectModel": "google/gemini-3-flash-preview",
  "selectThinkingLevel": "high",
  "selectPrompt": { "file": "examples/01-rag-imagegen/select-prompt.md" },
  "maxPages": 1,
  "spriteSize": 6,
  "select": 6,
  "output": {
    "mode": "ignore",
    "explode": true
  }
}
```

| Setting | Value | Description |
| :--- | :--- | :--- |
| `queryPrompt` | (File) | Instructions for the AI to generate search keywords (e.g., "Girl sandbox" instead of just "Kindergarten"). |
| `queryCount` | `5` | We generate 5 distinct search queries to cast a wide net. |
| `selectPrompt` | (File) | **The Judge.** This prompt contains a scoring table (e.g., "+5 points if core activity visible"). The AI uses this to look at the search results and pick the single best image. |
| `spriteSize` | `6` | To save tokens, we stitch 6 images into one "sprite" sheet before sending them to the Vision Model for selection. |
| `select` | `6` | We keep the top 6 images. |
| `output.explode` | `true` | **With flag:** Splits the selected images into separate processing tasks (one per image). The generation model runs multiple times, each with a single reference image.<br><br>**Without flag:** All selected images are passed to the generation model in a single context. The model runs once, seeing all references at the same time. |

### 💥 Understanding `explode`

This example uses `explode: true`. It changes the pipeline flow significantly:

| Mode | Behavior | Result | Cost |
| :--- | :--- | :--- | :--- |
| **With Explode** | The 6 selected reference images are split into **6 separate tasks**. | You get **6 output images**. Each generated image is influenced by exactly *one* reference image. | Higher (6x generations) |
| **Without Explode** | The 6 reference images are kept together in the context. | You get **1 output image**. The AI sees *all 6 references* at once and synthesizes them into one result. | Lower (1x generation) |

### 2. Generation

```json
{
  "prompt": { "file": "examples/01-rag-imagegen/prompt.md" },
  "aspectRatio": "3:2",
  "candidates": 2
}
```

| Setting | Value | Description |
| :--- | :--- | :--- |
| `prompt` | (File) | The detailed instructions for the generation. Note that because we used `image-search`, the selected reference image is automatically passed to this model as context. |
| `candidates` | `2` | We generate 2 variations of the final image. |

### 3. Post-Processing

```json
{
  "command": "magick '{{file}}' -resize 900x600 -quality 85 '{{file}}'"
}
```

A shell command that runs after the file is saved. We use `magick` (ImageMagick) to resize the output to 900x600.

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

The results will be saved to `out/01-rag-imagegen/Sailing_school/` (folder name is sanitized).

Because we use **Explode** (6 reference images) and **Candidates** (2 variations per reference), you will get multiple files named with the pattern `HeroImage_{refIndex}_{candidateIndex}.jpg`:

*   `HeroImage_0_1.jpg`
*   `HeroImage_0_2.jpg`
*   ...
*   `HeroImage_5_1.jpg`
*   `HeroImage_5_2.jpg`

# Website Style Analyzer Tutorial

This example demonstrates the **Style Scraper** plugin. Unlike standard scrapers that look for text, this plugin captures the **visual state** of a website, including screenshots and computed CSS, to allow Vision Models to analyze design.

> **💡 Tip:** This tutorial is the primary reference for understanding and configuring the **Style Scraper Plugin**.

## 🎯 Goal
Reverse-engineer the design system of a website (`butlerapp.de`) and generate a Markdown summary of its color palette, typography, and brand personality.

## 📸 The Style Scraper Plugin

In `run.sh`, we use specific flags to tell the scraper what to capture:

```bash
--style-scrape-url "{{website_url}}" \
--style-scrape-resolution "1920x1080" \
--style-scrape-mobile \
--style-scrape-interactive
```

*   **`--style-scrape-url`**: The target website.
*   **`--style-scrape-resolution`**: Sets the viewport for the desktop screenshot.
*   **`--style-scrape-mobile`**: **Crucial.** This forces the scraper to also emulate a mobile device (iPhone size) and take a second screenshot. This allows the AI to analyze responsiveness.
*   **`--style-scrape-interactive`**: This runs a script to find buttons, inputs, and links on the page. It hovers over them, takes snapshots of their states (Normal vs Hover), and extracts their computed CSS (colors, padding, fonts).

#### ⚙️ Style Scraper Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "type": {
      "const": "style-scraper",
      "description": "Must be 'style-scraper'"
    },
    "url": {
      "type": "string",
      "description": "URL to scrape. Supports Handlebars (e.g., '{{url}}')."
    },
    "resolution": {
      "type": "string",
      "default": "1920x1080",
      "description": "Viewport resolution for desktop screenshot."
    },
    "mobile": {
      "type": "boolean",
      "default": false,
      "description": "Capture an additional mobile screenshot (iPhone X viewport)."
    },
    "interactive": {
      "type": "boolean",
      "default": false,
      "description": "Find interactive elements, hover them, and capture screenshots + CSS."
    }
  },
  "required": ["type", "url"]
}
```

## 🧠 The Prompt

The prompt (`describe-styles.md`) receives all these assets (Desktop Image, Mobile Image, Element Snapshots, CSS text) as context. It asks the AI to synthesize this into a design system document.

## 🚀 Running the Example

1.  **Set API Keys**:
    ```bash
    export BATCHPROMPT_OPENAI_API_KEY="sk-..."
    # Serper key is not strictly required for this plugin, but good practice
    ```
2.  **Run**:
    ```bash
    bash examples/04-describe-website-css/run.sh
    ```

The result is a Markdown file at `out/04-describe-website-css/butlerapp.de/style-analysis.md`.

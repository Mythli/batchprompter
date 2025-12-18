# Website Style Analyzer

This example demonstrates how to use the **Style Scraper** plugin to perform a visual design analysis of a website.

## Overview

The pipeline performs the following steps for a given URL:

1.  **Visual Scraping:**
    *   Captures a high-resolution desktop screenshot.
    *   Captures a mobile screenshot.
    *   Identifies and captures interactive elements (buttons, inputs) and their computed CSS styles.
2.  **Design Analysis:**
    *   Passes the visual assets to a Vision Model (e.g., GPT-4o).
    *   Generates a comprehensive design system summary covering color palette, typography, UI components, and brand personality.

## Prerequisites

*   **Node.js** installed.
*   **API Keys:**
    *   `BATCHPROMPT_OPENAI_API_KEY`: For the Vision Model.
    *   `BATCHPROMPT_SERPER_API_KEY`: (Optional) Not used in this specific example, but good to have for other plugins.

## Usage

1.  Navigate to the project root.
2.  Run the example script:

```bash
bash examples/04-describe-website-css/run.sh
```

## Configuration

*   **Input:** `examples/04-describe-website-css/data.csv` - Contains the `website_url` to analyze.
*   **Prompt:** `examples/04-describe-website-css/describe-styles.md` - The instructions for the AI designer.

## Output

The analysis is saved as a Markdown file in `out/04-describe-website-css/{website_url}/style-analysis.md`.

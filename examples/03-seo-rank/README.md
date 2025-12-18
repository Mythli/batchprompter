# SEO Rank Tracker

This example demonstrates how to use `batchprompt` to check the visibility of a specific domain across a list of keywords in Google Search results.

## Overview

For each keyword in the input CSV, the pipeline:

1.  **Web Search:** Performs a Google search for the keyword (fetching up to 3 pages).
2.  **Rank Analysis:** Uses an LLM to scan the search results and identify links pointing to a specific target domain (e.g., `butlerapp.de`).
3.  **Reporting:** Outputs the matching links found for each keyword.

## Prerequisites

*   **Node.js** installed.
*   **API Keys:**
    *   `BATCHPROMPT_OPENAI_API_KEY`: For the LLM.
    *   `BATCHPROMPT_SERPER_API_KEY`: For Google Search.

## Usage

1.  Navigate to the project root.
2.  Run the example script:

```bash
bash examples/03-seo-rank/run.sh
```

## Configuration

*   **Input:** `examples/03-seo-rank/data.csv` - A list of keywords to check.
*   **Config:** `examples/03-seo-rank/config.json` - Defines the search parameters and the target domain to look for.

To check a different domain, edit the `selectPrompt` in `examples/03-seo-rank/config.json`:

```json
"selectPrompt": "Select up to 10 links that point to YOUR_DOMAIN. If no link exists, select nothing."
```

## Output

The results are saved to `out/03-seo-rank/results.csv`.

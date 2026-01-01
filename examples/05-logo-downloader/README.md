# Logo Downloader Example

This example demonstrates how to use the `logo-scraper` plugin to extract brand logos, favicons, and colors from a website.

## How it works

1.  **Scrape**: The `logo-scraper` plugin navigates to the target URL using Puppeteer.
2.  **Extract**: It identifies potential logo candidates from:
    *   HTML `<img>` tags
    *   CSS `background-image` properties
    *   Inline `<svg>` elements
    *   Favicons
3.  **Analyze**: It uses a vision-capable LLM (e.g., GPT-4o) to analyze the website screenshot and the candidate images to:
    *   Score each image on likelihood of being the main brand logo.
    *   Identify the primary brand colors.
4.  **Output**: The best logo and favicon are saved to disk, and the analysis (colors, scores) is saved as JSON.

## Configuration

The `config.json` defines the pipeline:

*   **Data**: A simple CSV with a list of websites.
*   **Step 1**: Uses the `logo-scraper` plugin.
    *   `url`: The target website URL.
    *   `logoOutputPath`: Where to save the best logo.
    *   `faviconOutputPath`: Where to save the best favicon.
    *   `analyzeModel`: The vision model used for scoring (e.g., `gpt-4o`).
    *   `extractModel`: A faster model used for finding inline SVGs (e.g., `gpt-4o-mini`).

## Running the example

```bash
./run.sh
```

Check the `out/05-logo-downloader` directory for results. The `results.csv` file will contain the paths to the downloaded logos and the extracted brand colors.

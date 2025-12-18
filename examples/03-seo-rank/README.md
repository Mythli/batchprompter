# SEO Rank Tracker Tutorial

This example shows how to use `batchprompt` as a flexible SEO tool. It demonstrates how to use the **Web Search Plugin** with an **AI Selector** to perform intelligent rank tracking.

## 🎯 Goal
Check a list of keywords (from `data.csv`) and determine if a specific domain (e.g., `butlerapp.de`) appears in the top Google search results.

## ⚙️ Configuration (`config.json`)

The magic happens in the `plugins` section of the config file.

```json
{
  "type": "web-search",
  "query": "{{keyword}}",
  "maxPages": 3,
  "limit": 30,
  "selectPrompt": "Select up to 10 links that point to Butlerapp (butlerapp.de). If no Butlerapp link exists, select nothing.",
  "output": {
    "mode": "merge"
  }
}
```

### Key Settings Explained:

*   **`query`: `{{keyword}}`**: This pulls the search term from the input CSV row.
*   **`maxPages`: 3**: We tell the scraper to fetch the first 3 pages of Google results (approx. 30 results).
*   **`selectPrompt`**: **This is the filter.**
    *   Normally, `web-search` returns the most relevant results for the *query*.
    *   By setting a `selectPrompt`, we tell the AI to look at those 30 results and **only return the ones that match our criteria** (links to `butlerapp.de`).
    *   If the domain isn't found, the AI returns nothing, effectively telling us we are not ranking for that keyword.

## 🚀 Running the Example

1.  **Set API Keys**:
    ```bash
    export BATCHPROMPT_OPENAI_API_KEY="sk-..."
    export BATCHPROMPT_SERPER_API_KEY="..."
    ```
2.  **Run**:
    ```bash
    bash examples/03-seo-rank/run.sh
    ```

The output `out/03-seo-rank/results.csv` will contain the keywords and the specific URLs where the domain was found ranking.

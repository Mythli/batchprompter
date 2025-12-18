# SEO Rank Tracker Tutorial

This example shows how to use `batchprompt` as a flexible SEO tool. It demonstrates how to use the **Web Search Plugin** with an **AI Selector** to perform intelligent rank tracking.

> **💡 Tip:** This tutorial is the primary reference for understanding and configuring the **Web Search Plugin**.

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
    "mode": "merge",
    "explode": true
  }
}
```

### Key Settings Explained

| Setting | Value in Example | Description |
| :--- | :--- | :--- |
| `query` | `{{keyword}}` | This pulls the search term from the input CSV row. |
| `maxPages` | `3` | We tell the scraper to fetch the first 3 pages of Google results (approx. 30 results). |
| `selectPrompt` | *"Select up to 10 links..."* | **This is the filter.** Normally, `web-search` returns the most relevant results for the *query*. By setting a `selectPrompt`, we tell the AI to look at those 30 results and **only return the ones that match our criteria** (links to `butlerapp.de`). If the domain isn't found, the AI returns nothing, effectively telling us we are not ranking for that keyword. |
| `output.explode` | `true` | If multiple links are found, this splits the result into multiple rows (one per link) so we can see every ranking URL in the output CSV. |

#### 🤖 How the Web Search Plugin Works Internally
The plugin uses a **Map-Reduce** approach to handle large volumes of search results efficiently:

1.  **Generate Queries:** If configured, an LLM generates multiple search variations (e.g., "Language school", "German courses") to cast a wide net.
2.  **Scatter (Search & Filter):** It executes all searches in parallel. If a `selectPrompt` is provided, it applies a **Local Filter** to each page of results immediately. This discards irrelevant results (like directories or ads) before they clog up the pipeline.
3.  **Gather & Dedupe:** It collects all surviving results and removes duplicates based on the `dedupeStrategy` (e.g., keeping only one result per domain).
4.  **Reduce (Global Selection):** If the number of unique results still exceeds the `limit`, it runs a final **Global Selection** step to pick the absolute best matches.
5.  **Enrich:** Finally, if `mode` is set to `markdown` or `html`, it visits the selected URLs to fetch their full content.

#### ⚙️ Web Search Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "type": {
      "const": "web-search",
      "description": "Must be 'web-search'"
    },
    "query": {
      "type": "string",
      "description": "The search query. Supports Handlebars (e.g., '{{keyword}}')."
    },
    "limit": {
      "type": "integer",
      "default": 5,
      "description": "Max total results to return."
    },
    "mode": {
      "enum": ["none", "markdown", "html"],
      "default": "none",
      "description": "Content fetching mode: 'none' (snippets only), 'markdown', 'html'."
    },
    "queryCount": {
      "type": "integer",
      "default": 3,
      "description": "Number of queries to generate (if using query model)."
    },
    "maxPages": {
      "type": "integer",
      "default": 1,
      "description": "Max pages of search results to fetch per query."
    },
    "dedupeStrategy": {
      "enum": ["none", "domain", "url"],
      "default": "none",
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
      "description": "Model used to select/filter results."
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
      "description": "Criteria for selecting results."
    },
    "compressModel": {
      "type": "string",
      "description": "Model used to summarize page content (if mode is not 'none')."
    },
    "compressThinkingLevel": {
      "enum": ["low", "medium", "high"],
      "description": "Reasoning effort for the compression model."
    },
    "compressTemperature": {
      "type": "number",
      "description": "Temperature for the compression model."
    },
    "compressPrompt": {
      "type": "string",
      "description": "Instructions for summarizing content."
    }
  },
  "required": ["type"]
}
```

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

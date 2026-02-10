# SEO Rank Tracker

This example uses `batchprompt` to check if a specific domain appears in Google search results for a list of keywords.

## Goal

Check keywords from `data.csv` and determine if `butlerapp.de` appears in the top Google search results.

## Configuration

The pipeline is defined in `config.json`:

```json
{
  "model": "google/gemini-3-flash-preview",
  "output": {
    "tmpDir": "out/03-seo-rank/.tmp"
  },
  "dataOutputPath": "out/03-seo-rank/results.csv",
  "inputLimit": 10,
  "steps": [
    {
      "plugins": [
        {
          "type": "web-search",
          "query": "{{keyword}}",
          "maxPages": 3,
          "limit": 30,
          "mode": "none",
          "gl": "de",
          "hl": "de",
          "selectModel": {
            "prompt": "Select up to 10 links that point to Butlerapp..."
          },
          "output": {
            "mode": "merge",
            "explode": true
          }
        }
      ]
    }
  ]
}
```

### Key Settings

| Setting | Value | Description |
|:--------|:------|:------------|
| `query` | `{{keyword}}` | Pulls the search term from the input CSV row |
| `maxPages` | `3` | Fetches first 3 pages of Google results (~30 results) |
| `selectModel.prompt` | *"Select up to 10 links..."* | AI filter: looks at results and returns only links matching criteria (butlerapp.de). Uses a nested model config object. |
| `gl` / `hl` | `"de"` | Country and language for Google search |

### Output Configuration

```json
"output": {
  "mode": "merge",
  "explode": true
}
```

- **`mode: "merge"`**: Search result data (Title, Link, Snippet) is added to the CSV row
- **`explode: true`**: Creates 1 row per search result. Set to `false` to keep results as a JSON array in one row.

### Web Search Plugin Config

The `web-search` plugin uses nested model config objects for its AI operations:

```json
{
  "type": "web-search",
  "query": "{{keyword}}",
  "selectModel": {
    "model": "google/gemini-3-flash-preview",
    "prompt": "Select links matching criteria..."
  },
  "queryModel": {
    "model": "google/gemini-3-flash-preview",
    "prompt": "Generate search queries for..."
  }
}
```

Each model config (`queryModel`, `selectModel`, `compressModel`) accepts:
- `model`: Model name (inherits from global if not set)
- `prompt`: Instructions for the AI
- `system`: System prompt
- `temperature`: Temperature setting
- `thinkingLevel`: Reasoning effort (`low` / `medium` / `high`)

### How Web Search Works Internally

1. **Generate Queries**: LLM generates search variations (if `queryModel` configured)
2. **Scatter**: Executes searches in parallel, applies local filter via `selectModel`
3. **Gather & Dedupe**: Collects results, removes duplicates per `dedupeStrategy`
4. **Reduce**: If results exceed `limit`, runs global selection
5. **Enrich**: If `mode` is `markdown` or `html`, fetches full page content

## Running

```bash
export BATCHPROMPT_OPENAI_API_KEY="sk-..."
export BATCHPROMPT_SERPER_API_KEY="..."
bash examples/03-seo-rank/run.sh
```

# B2B Lead Generation

This example demonstrates a multi-stage pipeline for finding companies, qualifying them, and extracting contact details.

## Goal

Create a CSV list of "Sprachschulen" (Language Schools) enriched with CEO names, LinkedIn profiles, and top product offers.

## Architecture

Split into two phases:

1. **Phase 1: Find (`1-find.sh`)** → Scans the web for companies
2. **Phase 2: Enrich (`2-enrich.sh`)** → Visits websites and extracts details

## Data Flow Between Phases

Phase 1 outputs to **JSON** (`companies.json`) to preserve nested objects (e.g., `webSearch.link`). Phase 2 reads this JSON and references fields using their namespaced paths (e.g., `{{webSearch.link}}`).

> **Important:** Plugin outputs are namespaced under the plugin type. For example, the `webSearch` plugin stores its results under `webSearch.*`, and the `websiteAgent` plugin stores under `websiteAgent.*`. Templates must use these namespaced paths.

## Data Output Strategies

### 1. Explode (Expansion)
Used in Phase 1, Step 1:
```json
{ "output": { "mode": "merge", "explode": true } }
```
A single row produces multiple rows (e.g., one per city district).

### 2. Merge (Enrichment)
Used in Phase 2, Step 1 (Website Agent):
```json
{ "output": { "mode": "merge" } }
```
Extracted fields are merged into the existing row under the plugin namespace.

### 3. Column (Assignment)
Used in Phase 2, Step 2 (LinkedIn):
```json
{ "output": { "mode": "column", "column": "linkedinUrl" } }
```
Result stored in a specific column.

## Phase 1: Discovery

Config: `config-1-find.json`

### Global Model
```json
{
  "model": {
    "model": "google/gemini-3-flash-preview",
    "thinkingLevel": "high"
  }
}
```
The model config is an object with `model` name and settings. `thinkingLevel` controls reasoning effort.

### Web Search Plugin
```json
{
  "type": "web-search",
  "queryModel": {
    "prompt": "Generate 3 distinct search queries..."
  },
  "selectModel": {
    "prompt": "Select only the official websites..."
  },
  "dedupeStrategy": "domain"
}
```
Plugin model configs (`queryModel`, `selectModel`) are nested objects with `model`, `prompt`, `temperature`, `thinkingLevel` etc. They inherit `model` name from the global config if not specified.

## Phase 2: Enrichment

Config: `config-2-enrich.json`

### Website Agent
```json
{
  "type": "website-agent",
  "url": "{{webSearch.link}}",
  "schema": { ... },
  "budget": 10,
  "batchSize": 3
}
```

Note the use of `{{webSearch.link}}` — the `link` field from Phase 1's web search is namespaced under `webSearch`.

The agent autonomously navigates websites to fill in a JSON schema. It uses three internal LLM agents:

| Agent | Purpose | Config Key |
|:------|:--------|:-----------|
| Navigator | Decides which links to click | `navigatorModel` |
| Extractor | Reads page content | `extractModel` |
| Merger | Consolidates partial results | `mergeModel` |

Each accepts `{ model, prompt, system, temperature, thinkingLevel }`.

### Validation Plugin
```json
{
  "type": "validation",
  "schema": { "required": ["companyName", "decisionMaker"] },
  "failMode": "drop"
}
```
Drops rows that don't meet quality criteria (missing company name or decision maker). The validation plugin is placed in the **same step** as the websiteAgent so it validates the agent's output directly.

### LinkedIn Finder
```json
{
  "type": "web-search",
  "query": "site:linkedin.com/in/ {{websiteAgent.decisionMaker.firstName}} ...",
  "selectModel": {
    "prompt": "Select the LinkedIn personal profile..."
  }
}
```

Note the use of `{{websiteAgent.decisionMaker.firstName}}` — fields extracted by the websiteAgent are namespaced under `websiteAgent`.

## Running

```bash
export BATCHPROMPT_OPENAI_API_KEY="sk-..."
export BATCHPROMPT_SERPER_API_KEY="..."
bash examples/02-lead-gen/run.sh
```

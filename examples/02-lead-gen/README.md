# B2B Lead Generation Tutorial

This example demonstrates a sophisticated **multi-stage pipeline** configured via JSON files. It automates the process of finding companies, qualifying them, and finding contact details for decision-makers.

> **💡 Tip:** This tutorial is the primary reference for understanding and configuring the **Website Agent**.

## 🎯 Goal
Create a CSV list of "Sprachschulen" (Language Schools) in Münster, enriched with the CEO's name, their LinkedIn profile, and their top product offer.

## 🏗️ Architecture

The pipeline is split into two phases to allow for manual review in between if necessary.

1.  **Phase 1: Find (`1-find.sh`)** -> Scans the web for companies.
2.  **Phase 2: Enrich (`2-enrich.sh`)** -> Visits websites and finds people.

---

## 💾 Data Output Strategies

This pipeline demonstrates the three core ways BatchPrompt handles data:

### 1. Explode (Expansion)
Used in **Phase 1 (Step 1)**.
*   **Config:** `"output": { "mode": "merge", "explode": true }`
*   **Scenario:** The AI lists 5 districts of Münster.
*   **Result:** The single row "Münster" is deleted and replaced by **5 new rows** (one for each district). The pipeline continues with 5x the volume.

### 2. Merge (Enrichment)
Used in **Phase 2 (Step 1 - Website Agent)**.
*   **Config:** `"output": { "mode": "merge" }`
*   **Scenario:** The agent finds `{ "ceo": "John Doe", "price": 500 }`.
*   **Result:** These fields are **merged** into the existing row. The row count stays the same, but the columns grow.
*   *Note:* If `explode` were true here, and the agent found 2 CEOs, the row would split into 2 rows (one for each CEO).

### 3. Column (Assignment)
Used in **Phase 2 (Step 3 - LinkedIn)**.
*   **Config:** `"output": { "mode": "column", "column": "linkedinUrl" }`
*   **Scenario:** We want the LinkedIn URL in a specific column, not merged at the root level.
*   **Result:** The result string is saved specifically to the `linkedinUrl` column.

---

## 🔎 Phase 1: Discovery (`1-find.sh`)

This configuration (`config-1-find.json`) finds the raw list of company websites.

### Step 1: Location Expansion
```json
{
  "prompt": "List the city of Münster...",
  "output": { "mode": "merge", "explode": true }
}
```

| Property | Value | Description |
| :--- | :--- | :--- |
| `prompt` | *"List the city of Münster..."* | Asks the AI to output a list of locations. |
| `output.explode` | `true` | If the AI lists multiple districts or cities, the pipeline splits here, creating a separate search task for each location. |

### Step 2: Intelligent Search
```json
{
  "plugins": [
    {
      "type": "web-search",
      "queryPrompt": "Generate 3 distinct search queries...",
      "selectPrompt": "Select only the official websites...",
      "dedupeStrategy": "domain"
    }
  ]
}
```

| Property | Value | Description |
| :--- | :--- | :--- |
| `queryPrompt` | *"Generate 3 distinct..."* | Instead of searching for "Sprachschule Münster", the AI generates variations like "Language school Münster contact", "German courses Münster", etc. |
| `selectPrompt` | *"Select only the official..."* | The AI reviews the Google Search snippets and filters out directories (like Yelp or Yellow Pages), keeping only actual company websites. |
| `dedupeStrategy` | `"domain"` | Ensures we don't list the same company twice if they appear in multiple searches. |

---

## 💎 Phase 2: Enrichment (`2-enrich.sh`)

This configuration (`config-2-enrich.json`) takes the list of URLs and extracts deep insights.

### Step 1: The Website Agent
```json
{
  "plugins": [
    {
      "type": "website-agent",
      "url": "{{link}}",
      "schema": { ... },
      "budget": 10,
      "batchSize": 3
    }
  ]
}
```
*   **`website-agent`**: This is an autonomous scraper. It visits the URL, and if it doesn't find the info on the homepage, it clicks links (like "Impressum", "About Us", "Team") to find it.

#### ⚙️ Full Configuration Schema

The `website-agent` is highly configurable. You can control the specific models, prompts, and reasoning levels for each internal agent (Navigator, Extractor, Merger).

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "type": {
      "const": "website-agent",
      "description": "Must be 'website-agent'"
    },
    "url": {
      "type": "string",
      "description": "The starting URL to scrape. Supports Handlebars syntax (e.g., '{{link}}')."
    },
    "schema": {
      "type": ["object", "string"],
      "description": "The JSON Schema defining the data to extract. Can be an inline object or a path to a schema file."
    },
    "budget": {
      "type": "integer",
      "default": 10,
      "description": "Maximum number of pages to visit per website."
    },
    "batchSize": {
      "type": "integer",
      "default": 3,
      "description": "Number of pages to visit in parallel during each iteration."
    },
    "navigatorModel": {
      "type": "string",
      "description": "Model used by the Navigator agent to decide which links to click."
    },
    "navigatorThinkingLevel": {
      "enum": ["low", "medium", "high"],
      "description": "Reasoning effort for the Navigator model."
    },
    "navigatorTemperature": {
      "type": "number",
      "description": "Temperature for the Navigator model."
    },
    "navigatorPrompt": {
      "type": "string",
      "description": "Custom instructions for the Navigator. Can be raw text, a file path, or a directory path."
    },
    "extractModel": {
      "type": "string",
      "description": "Model used by the Extractor agent to read page content."
    },
    "extractThinkingLevel": {
      "enum": ["low", "medium", "high"],
      "description": "Reasoning effort for the Extractor model."
    },
    "extractTemperature": {
      "type": "number",
      "description": "Temperature for the Extractor model."
    },
    "extractPrompt": {
      "type": "string",
      "description": "Custom instructions for the Extractor."
    },
    "mergeModel": {
      "type": "string",
      "description": "Model used by the Merger agent to consolidate data."
    },
    "mergeThinkingLevel": {
      "enum": ["low", "medium", "high"],
      "description": "Reasoning effort for the Merger model."
    },
    "mergeTemperature": {
      "type": "number",
      "description": "Temperature for the Merger model."
    },
    "mergePrompt": {
      "type": "string",
      "description": "Custom instructions for the Merger."
    }
  },
  "required": ["type", "url", "schema"]
}
```

#### 🧠 Advanced Model Configuration

**1. Reasoning Levels (`thinkingLevel`)**
For complex tasks, you can enable "reasoning" (Chain of Thought) if the underlying model supports it (e.g., Gemini 2.0 Flash Thinking, OpenAI o1/o3).
*   **`high`**: Best for the **Navigator** to make smart decisions about which links are relevant.
*   **`low`** / **`medium`**: Good for extraction or merging.

**2. Custom Prompts (Files & Folders)**
All `*Prompt` fields (e.g., `navigatorPrompt`) accept three types of input:
*   **Raw Text**: `"You are a navigator..."`
*   **File Path**: `"prompts/navigator.md"` (The file content is loaded).
*   **Directory Path**: `"prompts/navigator/"` (All files in the directory are loaded and concatenated. Useful for providing few-shot examples as separate files).

**3. Schema as File**
Instead of writing a huge JSON object inline, you can save your schema to a file and reference it:
`"schema": "schemas/company-schema.json"`

*   **`schema`**: Defines exactly what we want.
    *   **Why is everything optional?** The agent visits up to 10 pages per website. It extracts data from *each* page individually. A single page (like "About Us") might contain the CEO's name but not the pricing, while another page (like "Offers") has the pricing but not the CEO. By making fields nullable (`["string", "null"]`), we allow the agent to extract partial information from each page. These partial results are then merged into a complete profile.
    *   `decisionMaker`: We ask for the CEO/Founder's name.
    *   `topOffer`: We ask the AI to identify the main product and its price.
    *   `isIndustry`: A boolean check to ensure this is actually a language school.

#### 🤖 How the Website Agent Works Internally
The agent operates in a loop to gather information intelligently:
1.  **Visit & Extract:** It visits the current URL and uses an LLM to extract any data matching your schema found on *that specific page*.
2.  **Scan Links:** It identifies all internal links on the page (e.g., "Contact", "Imprint", "Pricing").
3.  **Navigate:** A "Navigator" LLM reviews the data collected so far and the available links. It decides which page to visit next to fill in the missing blanks (e.g., "I have the company name, but I still need the CEO. I will visit the 'Team' page next.").
4.  **Repeat:** It repeats this process until the `budget` (max pages) is reached or the Navigator decides it has found everything.
5.  **Merge:** Finally, a "Merger" LLM consolidates all the partial data snippets from the different pages into one final, clean JSON object.

### Step 2: Validation
```json
{
  "plugins": [
    {
      "type": "validation",
      "schema": { ... "required": ["companyName", "decisionMaker"] ... }
    }
  ]
}
```
*   **What it does:** Since Step 1 was permissive (collecting whatever it could find), Step 2 is strict. It checks the extracted data against a rigid schema.
*   **The Filter:** If the Website Agent failed to find a `companyName` or a `decisionMaker`, this row is **dropped**. This ensures your final list only contains high-quality leads with actionable contact info.

### Step 3: LinkedIn Finder
```json
{
  "plugins": [
    {
      "type": "web-search",
      "query": "site:linkedin.com/in/ {{decisionMaker.firstName}}...",
      "selectPrompt": "Select the LinkedIn personal profile..."
    }
  ]
}
```

| Property | Value | Description |
| :--- | :--- | :--- |
| `query` | *"site:linkedin.com/in/..."* | It constructs a targeted Google search using the name found in Step 1. |
| `selectPrompt` | *"Select the LinkedIn..."* | The AI looks at the search results to pick the correct LinkedIn profile URL, ignoring company pages. |

---

## 🚀 Running the Example

1.  **Set API Keys**:
    ```bash
    export BATCHPROMPT_OPENAI_API_KEY="sk-..."
    export BATCHPROMPT_SERPER_API_KEY="..."
    ```
2.  **Run**:
    ```bash
    bash examples/02-lead-gen/run.sh
    ```

Check `out/02-lead-gen/companies_enriched.csv` for the results.

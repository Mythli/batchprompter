# B2B Lead Generation Tutorial

This example demonstrates a sophisticated **multi-stage pipeline** configured via JSON files. It automates the process of finding companies, qualifying them, and finding contact details for decision-makers.

## 🎯 Goal
Create a CSV list of "Sprachschulen" (Language Schools) in Münster, enriched with the CEO's name, their LinkedIn profile, and their top product offer.

## 🏗️ Architecture

The pipeline is split into two phases to allow for manual review in between if necessary.

1.  **Phase 1: Find (`1-find.json`)** -> Scans the web for companies.
2.  **Phase 2: Enrich (`2-enrich.json`)** -> Visits websites and finds people.

---

## 🔎 Phase 1: Discovery (`1-find.json`)

This configuration finds the raw list of company websites.

### Step 1: Location Expansion
```json
{
  "prompt": "List the city of Münster...",
  "output": { "mode": "merge", "explode": true }
}
```
*   **What it does:** It asks the AI to output a list of locations. `explode: true` means if the AI lists multiple districts or cities, the pipeline splits here, creating a separate search task for each location.

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
*   **`queryPrompt`**: Instead of searching for "Sprachschule Münster", the AI generates variations like "Language school Münster contact", "German courses Münster", etc.
*   **`selectPrompt`**: The AI reviews the Google Search snippets and filters out directories (like Yelp or Yellow Pages), keeping only actual company websites.
*   **`dedupeStrategy: domain`**: Ensures we don't list the same company twice if they appear in multiple searches.

---

## 💎 Phase 2: Enrichment (`2-enrich.json`)

This configuration takes the list of URLs and extracts deep insights.

### Step 1: The Website Agent
```json
{
  "plugins": [
    {
      "type": "website-agent",
      "url": "{{link}}",
      "schema": { ... }
    }
  ]
}
```
*   **`website-agent`**: This is an autonomous scraper. It visits the URL, and if it doesn't find the info on the homepage, it clicks links (like "Impressum", "About Us", "Team") to find it.
*   **`schema`**: Defines exactly what we want.
    *   **Why is everything optional?** You will notice fields are defined as `["string", "null"]`. Real-world websites are messy. Some don't list a CEO, some don't show prices. By making fields nullable, we allow the agent to capture *partial data* (e.g., just the company name) instead of failing the entire extraction if one piece is missing.
    *   `decisionMaker`: We ask for the CEO/Founder's name.
    *   `topOffer`: We ask the AI to identify the main product and its price.
    *   `isIndustry`: A boolean check to ensure this is actually a language school.

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
*   **What it does:** It constructs a targeted Google search using the name found in Step 1.
*   **`selectPrompt`**: The AI looks at the search results to pick the correct LinkedIn profile URL, ignoring company pages.

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

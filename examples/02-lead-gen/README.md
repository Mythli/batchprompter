# Lead Generation Pipeline

This example demonstrates a multi-stage pipeline for generating B2B leads. It finds companies in a specific industry and location, then enriches them with detailed contact information and decision-maker profiles.

## Overview

The pipeline consists of two main stages:

1.  **Find (Discovery):**
    *   Takes an industry (e.g., "Sprachschule") as input.
    *   Expands the target location (e.g., listing cities).
    *   Searches for companies offering the service in those locations.
    *   Dedupes results by domain.
2.  **Enrich (Qualification):**
    *   Visits each company's website using the **Website Agent**.
    *   Extracts structured data: Company Name, Address, Decision Maker (CEO/Founder), and Top Offers.
    *   Validates that the company matches the target industry.
    *   Searches for the Decision Maker's LinkedIn profile.

## Prerequisites

*   **Node.js** installed.
*   **API Keys:**
    *   `BATCHPROMPT_OPENAI_API_KEY`: For LLM processing.
    *   `BATCHPROMPT_SERPER_API_KEY`: For Google Search.

## Usage

1.  Navigate to the project root.
2.  Run the full pipeline script:

```bash
bash examples/02-lead-gen/run.sh
```

## Configuration

*   **Input:** `examples/02-lead-gen/test.csv` (contains the industry).
*   **Find Config:** `examples/02-lead-gen/1-find.yaml` - Configures the search queries and location expansion.
*   **Enrich Config:** `examples/02-lead-gen/2-enrich.yaml` - Configures the scraping schema and LinkedIn search.

## Output

*   **Found Companies:** `out/02-lead-gen/companies.csv`
*   **Enriched Leads:** `out/02-lead-gen/companies_enriched.csv`

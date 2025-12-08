# BatchPrompt ⚡️

**BatchPrompt** is a CLI tool for building **AI pipelines**. It automates the process of chaining LLMs, Web Search, and Scrapers to process data in bulk.

Unlike a chatbot, BatchPrompt is **data-driven**: it takes a CSV/JSON file, and for every row, it executes a pipeline of steps to generate files or structured data.

---

## 📚 Table of Contents
1. [🚀 Quick Start](#-quick-start)
2. [🧠 How It Works (The Mental Model)](#-how-it-works-the-mental-model)
3. [👨‍🍳 Cookbook Examples](#-cookbook-examples)
    - [A. The Content Creator (Basic Text Gen)](#a-the-content-creator-basic-text-gen)
    - [B. The Researcher (Search + Scrape)](#b-the-researcher-search--scrape)
    - [C. The Lead Generator (Explode Pattern)](#c-the-lead-generator-explode-pattern)
    - [D. The Designer (UI/UX Analysis)](#d-the-designer-uiux-analysis)
    - [E. The Art Director (Image Gen with RAG)](#e-the-art-director-image-gen-with-rag)
4. [🔌 Plugins Reference](#-plugins-reference)
5. [🛠️ Advanced Features](#-advanced-features)
6. [⚙️ Configuration](#-configuration)

---

## 🚀 Quick Start

### 1. Install
```bash
npm install -g batchprompt
```

### 2. Configure Keys
(Recommended: Use [OpenRouter](https://openrouter.ai/) for access to OpenAI, Anthropic, and Google models via one key).

**Mac/Linux:**
```bash
export BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export BATCHPROMPT_OPENAI_API_KEY="sk-or-..."
export BATCHPROMPT_SERPER_API_KEY="your-serper-key" # Required for Search/Scraping
```

**Windows (PowerShell):**
```powershell
$env:BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
$env:BATCHPROMPT_OPENAI_API_KEY="sk-or-..."
$env:BATCHPROMPT_SERPER_API_KEY="your-serper-key"
```

---

## 🧠 How It Works (The Mental Model)

Think of BatchPrompt as an **assembly line**.

1.  **Input:** You feed it a CSV file. Each row is a "raw material".
2.  **The Workspace:** As a row moves down the line, it accumulates data in a temporary workspace (e.g., search results, scraped content).
3.  **The Pipeline:** You define a series of **Steps**.
    *   **Fetch:** Plugins (Web Search, Image Search) go out and get data.
    *   **Context:** The LLM receives the Row Data + Plugin Data.
    *   **Generate:** The LLM creates content (Text, Code, JSON).
    *   **Output:** The result is saved to a file OR merged back into the row for the next step.
4.  **Topology:** The line can split! One row can **Explode** into 10 rows (e.g., "List 10 cities" -> 10 separate tasks).

---

## 👨‍🍳 Cookbook Examples

### A. The Content Creator (Basic Text Gen)
**Goal:** Write unique Haikus for a list of topics.

**1. Input (`data.csv`):**
```csv
id,topic
1,Black Holes
2,Quantum Computing
```

**2. Command:**
```bash
batchprompt generate data.csv "Write a haiku about {{topic}}" \
  --model google/gemini-3-pro-preview \
  --output "haikus/{{id}}_{{topic}}.txt"
```

**What happens:**
*   BatchPrompt reads row 1 (`Black Holes`).
*   It replaces `{{topic}}` in your prompt.
*   It saves the result to `haikus/1_Black Holes.txt`.

---

### B. The Researcher (Search + Scrape)
**Goal:** "Find the CEO of these companies and summarize their background."

**1. Input (`companies.csv`):**
```csv
name
"OpenAI"
"Anthropic"
```

**2. Command:**
```bash
batchprompt generate companies.csv "Write a summary of {{name}} based on: {{websiteAgent.summary}}" \
  --web-search-query "official website for {{name}}" \
  --web-search-limit 1 \
  --website-agent-url "{{webSearch.0.link}}" \
  --website-agent-depth 0 \
  --model google/gemini-3-pro-preview
```

**Key Concept:** Passing data between plugins.
1.  `--web-search` runs first. It finds the URL.
2.  `--website-agent` runs second. It uses `{{webSearch.0.link}}` to scrape that URL.
3.  **Main Prompt** runs last, using the scraped data (`{{websiteAgent}}`).

---

### C. The Lead Generator (Explode Pattern)
**Goal:** "Find all cities in Germany > 50k population, then find specific companies in each city."

**1. Input (`topics.csv`):**
```csv
topic
"Renewable Energy"
```

**2. Schema (`schema.json`):**
```json
{
  "type": "object",
  "properties": {
    "subtopics": { "type": "array", "items": { "type": "string" } }
  }
}
```

**3. Command:**
```bash
batchprompt generate topics.csv \
  "List 5 sub-topics about {{topic}}" \
  "Write a detailed article about {{subtopics}}" \
  --json-schema-1 schema.json \
  --explode-1 \
  --output-2 "articles/{{topic}}/{{subtopics}}.md"
```

**Key Concept:** **Explosion**.
*   **Step 1** produces a JSON array: `["Solar", "Wind", "Hydro", ...]`.
*   **--explode-1** detects the array and creates 5 new tasks.
*   **Step 2** runs 5 times, once for each sub-topic.

---

### D. The Designer (UI/UX Analysis)
**Goal:** "Analyze the button styles of these competitors."

**1. Input (`urls.csv`):**
```csv
url
"https://stripe.com"
"https://airbnb.com"
```

**2. Command:**
```bash
batchprompt generate urls.csv "Analyze the button styles in this image." \
  --style-scrape-url "{{url}}" \
  --style-scrape-interactive \
  --model google/gemini-3-pro-preview \
  --output "analysis/{{url}}.md"
```

**Key Concept:** **Vision**.
*   The `StyleScraper` plugin uses Puppeteer to take screenshots and capture computed CSS.
*   It passes the screenshot to the Vision Model automatically.

---

### E. The Art Director (Image Gen with RAG)
**Goal:** "Generate a marketing banner for a specific industry, using real-world references."

**1. Input (`industries.csv`):**
```csv
industry
"Coffee Shop"
"Yoga Studio"
```

**2. Command:**
```bash
batchprompt generate industries.csv \
  "Generate a prompt for an image generation model based on this reference image: {{imageSearch.0.imageUrl}}" \
  --image-search-query "interior design of {{industry}}" \
  --image-search-select 1 \
  --model google/gemini-3-pro-preview \
  --output "prompts/{{industry}}.txt"
```

**Key Concept:** **RAG for Images**.
1.  `--image-search` finds real photos of coffee shops.
2.  `--image-search-select` uses a Vision LLM to pick the *best* reference photo.
3.  The Main Prompt uses that photo to write a detailed prompt for Midjourney/DALL-E.

---

## 🔌 Plugins Reference

Plugins populate specific variables when they run:

| Plugin Flag | Variable Name | Structure |
| :--- | :--- | :--- |
| `--web-search` | `{{webSearch}}` | Array: `[{ title, link, snippet }, ...]` |
| `--image-search` | `{{imageSearch}}` | Array: `[{ imageUrl, title }, ...]` |
| `--website-agent` | `{{websiteAgent}}` | Object: The extracted JSON schema result. |
| `--style-scraper` | `{{styleScraper}}` | Object: `{ desktop: "path.jpg", css: "..." }` |

---

## 🛠️ Advanced Features

### 🏆 Candidates & Judging
Generate multiple variations and pick the best one automatically.
```bash
batchprompt generate data.csv "Write a poem" \
  --candidates 3 \
  --judge-prompt "Pick the poem that rhymes best"
```
*   Generates 3 poems in parallel.
*   An AI Judge evaluates them and saves only the winner.

### 🧪 Verification & Feedback
Run a script to check the AI's work. If it fails, the AI tries again.
```bash
batchprompt generate data.csv "Write a python script" \
  --output "script.py" \
  --verify-command "python script.py" \
  --feedback-loops 3
```
*   If `python script.py` errors, the error message is sent back to the LLM to fix the code.

---

## ⚙️ Configuration

| Category | Flag | Description |
| :--- | :--- | :--- |
| **Global** | `--concurrency` | Max parallel LLM requests (Default: 20). |
| | `--tmp-dir` | Folder for temp files (Default: `.tmp`). |
| **Model** | `--model` | `google/gemini-3-pro-preview`, `anthropic/claude-3.5-sonnet`, etc. |
| | `--temperature` | Creativity (0.0 - 1.0). |
| **Output** | `--output` | File path template (e.g., `out/{{id}}.md`). |
| | `--output-column` | Save result to the CSV data for future steps. |
| **Flow** | `--explode` | Turn array results into multiple rows. |
| | `--candidates` | Generate N variations. |
| **Plugins** | `--web-search-query` | Enable Google Search. |
| | `--website-agent-url` | Enable Web Scraper. |
| | `--image-search-query` | Enable Image Search. |

**Note on Multi-Step:** Append `-{step}` to flags to target specific steps.
*   `--model-1 google/gemini-3-pro-preview` (Step 1 only)
*   `--web-search-query-2` (Step 2 only)

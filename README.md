# BatchPrompt ⚡️

**BatchPrompt** is a CLI tool for building **AI pipelines**. It automates the process of chaining LLMs, Web Search, and Scrapers to process data in bulk.

Unlike a chatbot, BatchPrompt is **data-driven**: it takes a CSV/JSON file, and for every row, it executes a pipeline of steps to generate files or structured data.

---

## 📚 Table of Contents
1. [🚀 Quick Start](#-quick-start)
2. [🧠 How It Works (The Mental Model)](#-how-it-works-the-mental-model)
3. [🪜 Understanding Steps](#-understanding-steps)
4. [👨‍🍳 Cookbook Examples](#-cookbook-examples)
    - [A. The Content Creator (Basic Text Gen)](#a-the-content-creator-basic-text-gen)
    - [B. The Researcher (Search + Scrape)](#b-the-researcher-search--scrape)
    - [C. The Lead Generator (Explode Pattern)](#c-the-lead-generator-explode-pattern)
    - [D. The Designer (UI/UX Analysis)](#d-the-designer-uiux-analysis)
    - [E. The Art Director (Image Gen with RAG)](#e-the-art-director-image-gen-with-rag)
5. [🔌 Plugins Reference](#-plugins-reference)
    - [Web Search](#web-search-plugin)
    - [Image Search](#image-search-plugin)
    - [Website Agent](#website-agent-plugin)
    - [Style Scraper](#style-scraper-plugin)
6. [🛠️ Advanced Features](#-advanced-features)
7. [⚙️ Configuration](#-configuration)

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

### The Data Flow (Visualized)

```mermaid
graph TD
    Input[📂 Input CSV Row] -->|Load| Workspace[📦 Workspace]
    
    subgraph Step 1 [Step 1: Research]
        Workspace -->|Query| Plugin1[🔌 Web Search Plugin]
        Plugin1 -->|Results| Workspace
        Workspace -->|Context| LLM1[🧠 LLM (Text)]
        LLM1 -->|Summary| Workspace
    end
    
    subgraph Step 2 [Step 2: Creation]
        Workspace -->|Ref Image| LLM2[🎨 LLM (Image Gen)]
        LLM2 -->|New Image| Output[💾 File Output]
    end
    
    Workspace -.->|--export| NextRow[Next Step / Final CSV]
```

---

## 🪜 Understanding Steps

BatchPrompt executes tasks in **Steps**. A single command can define multiple steps, allowing you to chain operations (e.g., "Search -> Scrape -> Summarize").

### The Step Lifecycle
For every row in your data, each step performs the following actions in order:

1.  **Preparation:** Plugins run first.
    *   Example: `--web-search-query` runs a Google search.
    *   Result: The search results are stored in the `Workspace` (e.g., `{{webSearch}}`).
2.  **Prompting:** The system builds the prompt for the LLM.
    *   It combines your **Row Data** (`{{topic}}`) + **Plugin Data** (`{{webSearch}}`).
3.  **Generation:** The LLM executes the prompt.
    *   It generates text, code, or an image.
4.  **Output:** The result is handled based on your flags.
    *   **Save:** If `--output` is set, the result is written to a file.
    *   **Export:** If `--export` is set, the result is merged back into the `Row` for the *next* step to use.

### Targeting Specific Steps
Flags without numbers apply globally or to the first step. To configure a specific step, append the step number to the flag.

*   `--model`: Sets the default model for all steps.
*   `--model-2`: Overrides the model for **Step 2 only**.
*   `--web-search-query-1`: Runs web search in **Step 1**.

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
**Goal:** "Generate a photorealistic image of a business, using a real-world photo as a style reference."

**1. Input (`locations.csv`):**
```csv
location,industry
"Tokyo","Coffee Shop"
"Berlin","Techno Club"
```

**2. Command:**
```bash
batchprompt generate locations.csv \
  "Generate a high-quality photo of a {{industry}} in {{location}}. Match the lighting and mood of this reference image: {{imageSearch.0.imageUrl}}" \
  --image-search-query "interior design {{industry}} {{location}} aesthetic" \
  --image-search-select 1 \
  --model "google/gemini-3-pro-image-preview" \
  --output "images/{{location}}_{{industry}}.jpg"
```

**Why this works (RAG for Images):**
1.  **Retrieval:** BatchPrompt searches Google Images for real examples (`--image-search`).
2.  **Selection:** It uses a Vision model to pick the single best image from the search results (`--image-search-select`).
3.  **Augmentation:** It passes that real image URL to Gemini as context.
4.  **Generation:** Gemini generates a *new* pixel-perfect image that adheres to the style of the reference.

---

## 🔌 Plugins Reference

Plugins populate specific variables in the `Workspace`. You can access these in your prompts using Handlebars syntax (e.g., `{{webSearch.0.link}}`).

### Web Search Plugin
Performs Google searches and optionally fetches page content.

**Variable:** `{{webSearch}}` (Array of results)
*   `title`: Page title.
*   `link`: URL.
*   `snippet`: Google search snippet.
*   `content`: Full page content (if mode is not 'none').

**Flags:**
| Flag | Description |
| :--- | :--- |
| `--web-search-query <text>` | Static search query. |
| `--web-search-limit <number>` | Max results to return (Default: 5). |
| `--web-search-max-pages <number>` | Max pages of search results to fetch per query (Default: 1). |
| `--web-search-mode <mode>` | `none` (snippets only), `markdown`, or `html`. |
| `--web-search-dedupe-strategy <strategy>` | `none`, `domain`, or `url` (Default: none). |
| `--web-search-gl <country>` | Country code for search results (e.g. us, de). |
| `--web-search-hl <lang>` | Language code for search results (e.g. en, de). |
| `--web-query-prompt <text>` | **AI Mode:** Prompt to generate queries dynamically. |
| `--web-select-prompt <text>` | **AI Mode:** Prompt to select best results. |

---

### Image Search Plugin
Searches Google Images, downloads them, and uses AI Vision to select the best ones.

**Variable:** `{{imageSearch}}` (Array of results)
*   `imageUrl`: Remote URL.
*   `localPath`: Path to the downloaded file (useful for CLI tools like ImageMagick).
*   `title`: Image title.
*   `source`: Source website name.
*   `domain`: Source hostname.

**Flags:**
| Flag | Description |
| :--- | :--- |
| `--image-search-query <text>` | Static search query (e.g., "blue cat"). |
| `--image-search-limit <number>` | Max images to fetch per query (Default: 12). |
| `--image-query-prompt <text>` | **AI Mode:** Prompt to generate search queries dynamically. |
| `--image-search-query-count <number>` | **AI Mode:** Number of queries to generate (Default: 3). |
| `--image-select-prompt <text>` | **AI Mode:** Prompt for the Vision model to select the best image. |
| `--image-search-select <number>` | Number of images to keep after selection (Default: 1). |
| `--image-search-sprite-size <number>` | Images per grid for Vision analysis (Default: 4). |
| `--image-query-model <model>` | Model for generating queries (Default: Global Model). |
| `--image-select-model <model>` | Vision model for selecting images (Default: Global Model). |

**Example (AI Selection):**
```bash
--image-query-prompt "Generate 3 search queries for {{industry}}."
--image-select-prompt "Select the image that is most photorealistic and has no text."
--image-select-model "google/gemini-3-pro-preview"
--image-search-sprite-size 4
```

---

### Website Agent Plugin
An autonomous agent that navigates a website to fill a specific JSON schema.

**Variable:** `{{websiteAgent}}` (Object matching your schema)

**Flags:**
| Flag | Description |
| :--- | :--- |
| `--website-agent-url <url>` | Starting URL. |
| `--website-agent-schema <path>` | Path to JSON schema file. |
| `--website-agent-budget <number>` | Max pages to visit (Default: 10). |
| `--website-navigator-model <model>` | Model used for navigation decisions. |

---

### Style Scraper Plugin
Captures screenshots and computed styles for UI/UX analysis.

**Variable:** `{{styleScraper}}` (Object)
*   `desktop`: Path to desktop screenshot.
*   `mobile`: Path to mobile screenshot.
*   `interactive`: Path to composite image of interactive elements.
*   `css`: Path to markdown file with computed styles.
*   `elements`: Map of element IDs to screenshot paths.

**Flags:**
| Flag | Description |
| :--- | :--- |
| `--style-scrape-url <url>` | Target URL. |
| `--style-scrape-resolution <res>` | Viewport (e.g., "1920x1080"). |
| `--style-scrape-mobile` | Enable mobile capture. |
| `--style-scrape-interactive` | Enable interactive element capture. |

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

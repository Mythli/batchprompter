# BatchPrompt

BatchPrompt is a CLI tool for building **AI pipelines**. It automates the process of chaining LLMs, Web Search, and Scrapers to process data in bulk.

Unlike a chatbot, BatchPrompt is **data-driven**: it takes a CSV/JSON file, and for every row, it executes a pipeline of steps to generate files or structured data.

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

## 🧪 Recipe 1: The Basics (Text Generation)
**Goal:** Generate a unique Haiku for a list of topics.

**1. Create `data.csv`:**
```csv
id,topic
1,Black Holes
2,Quantum Computing
```

**2. Run:**
```bash
batchprompt generate data.csv "Write a haiku about {{topic}}" \
  --model gpt-4o \
  --output "haikus/{{id}}_{{topic}}.txt"
```

**What happened?**
1. BatchPrompt read row 1 (`Black Holes`).
2. It replaced `{{topic}}` in your prompt.
3. It saved the result to `haikus/1_Black Holes.txt`.
4. It repeated this for row 2.

---

## 🔗 Recipe 2: Chaining Agents (Search -> Scrape -> Write)
**Goal:** Find a company's website, scrape their "About" page, and write a summary.

**The Logic:**
1.  **Plugin 1 (Web Search):** Find the URL.
2.  **Plugin 2 (Scraper):** Use the URL from Plugin 1 to get content.
3.  **LLM:** Use the content from Plugin 2 to write a summary.

**1. Create `companies.csv`:**
```csv
name
"OpenAI"
"Anthropic"
```

**2. Run:**
```bash
batchprompt generate companies.csv "Write a summary of {{name}} based on: {{websiteAgent.summary}}" \
  --web-search-query "official website for {{name}}" \
  --web-search-limit 1 \
  --website-agent-url "{{webSearch.0.link}}" \
  --website-agent-depth 0 \
  --model gpt-4o
```

**How Data Flows:**
*   `--web-search-query` runs first. It populates the variable `{{webSearch}}` (an array of results).
*   `--website-agent-url` runs second. We pass it `{{webSearch.0.link}}` (the URL of the first search result).
*   The agent scrapes that URL and populates `{{websiteAgent}}`.
*   Finally, the **Main Prompt** runs, having access to all previous data.

---

## 💥 Recipe 3: The "Deep Dive" (Explode Strategy)
**Goal:** Take one broad topic, generate 5 sub-topics, and write an article for *each* sub-topic.

**The Logic:**
1.  **Step 1:** LLM generates a JSON array of sub-topics.
2.  **Explode:** BatchPrompt turns that array into 5 new rows.
3.  **Step 2:** LLM writes an article for each new row.

**1. Create `topics.csv`:**
```csv
topic
"Renewable Energy"
```

**2. Create `schema.json` (for Step 1):**
```json
{
  "type": "object",
  "properties": {
    "subtopics": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

**3. Run:**
```bash
batchprompt generate topics.csv \
  "List 5 sub-topics about {{topic}}" \
  "Write a detailed article about {{subtopics}}" \
  --json-schema-1 schema.json \
  --explode-1 \
  --output-2 "articles/{{topic}}/{{subtopics}}.md"
```

**What happened?**
*   **Step 1** produced: `["Solar", "Wind", "Hydro", ...]`.
*   **--explode-1** detected the array and created 5 new tasks.
*   **Step 2** ran 5 times, once for each sub-topic.

---

## 🧠 Understanding Data Flow & Variables

When writing prompts or configuring plugins, you can use **Handlebars** syntax (e.g., `{{variable}}`) to access data.

### 1. CSV Data
Every column in your input CSV is available as a variable.
*   Column `product_name` -> `{{product_name}}`

### 2. Plugin Outputs
Plugins populate specific variables when they run:

| Plugin Flag | Variable Name | Structure |
| :--- | :--- | :--- |
| `--web-search` | `{{webSearch}}` | Array: `[{ title, link, snippet }, ...]` |
| `--image-search` | `{{imageSearch}}` | Array: `[{ imageUrl, title }, ...]` |
| `--website-agent` | `{{websiteAgent}}` | Object: The extracted JSON schema result. |
| `--style-scraper` | `{{styleScraper}}` | Object: `{ desktop: "path.jpg", css: "..." }` |

### 3. Step Outputs (Chaining Steps)
If you have a multi-step pipeline (e.g., Step 1 -> Step 2), you can pass data forward.

*   **Option A (Export):** Use `--output-column-1 my_summary`. Step 2 can now use `{{my_summary}}`.
*   **Option B (Automatic):** Step results are accumulated in the history, but explicit columns are safer for prompting.

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

### 🖼️ Image Selection
Search for images and have an AI pick the best one for your context.
```bash
batchprompt generate data.csv "Look at this image: {{imageSearch.0.imageUrl}}" \
  --image-search-query "{{topic}}" \
  --image-search-limit 10 \
  --image-select-prompt "Pick the most high-resolution, professional photo"
```

---

## ⚙️ Reference: Common Flags

| Category | Flag | Description |
| :--- | :--- | :--- |
| **Global** | `--concurrency` | Max parallel LLM requests (Default: 20). |
| | `--tmp-dir` | Folder for temp files (Default: `.tmp`). |
| **Model** | `--model` | `gpt-4o`, `claude-3-5-sonnet`, etc. |
| | `--temperature` | Creativity (0.0 - 1.0). |
| **Output** | `--output` | File path template (e.g., `out/{{id}}.md`). |
| | `--output-column` | Save result to the CSV data for future steps. |
| **Flow** | `--explode` | Turn array results into multiple rows. |
| | `--candidates` | Generate N variations. |
| **Plugins** | `--web-search-query` | Enable Google Search. |
| | `--website-agent-url` | Enable Web Scraper. |
| | `--image-search-query` | Enable Image Search. |

**Note on Multi-Step:** Append `-{step}` to flags to target specific steps.
*   `--model-1 gpt-4o` (Step 1 only)
*   `--web-search-query-2` (Step 2 only)

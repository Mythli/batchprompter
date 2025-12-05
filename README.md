# BatchPrompt

BatchPrompt is a command-line tool for building **AI pipelines**. It lets you chain together LLMs, Web Search, Image Search, and Web Scraping to process data in bulk.

Unlike simple "chat" bots, BatchPrompt is **data-driven**: it takes a CSV/JSON file as input, and for every row, it executes a series of steps (prompts, searches, scrapes) to generate files or structured data.

---

## 🚀 Quick Start

### 1. Install
Requires Node.js 18+.
```bash
npm install -g batchprompt
```

### 2. Configure Keys
We recommend **[OpenRouter](https://openrouter.ai/)** to access OpenAI, Anthropic, and Google models with one key.

**Mac/Linux:**
```bash
export BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export BATCHPROMPT_OPENAI_API_KEY="sk-or-..."
export BATCHPROMPT_SERPER_API_KEY="your-serper-key" # Optional: For Search/Scraping
```

**Windows (PowerShell):**
```powershell
$env:BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
$env:BATCHPROMPT_OPENAI_API_KEY="sk-or-..."
$env:BATCHPROMPT_SERPER_API_KEY="your-serper-key"
```

### 3. Run Your First Batch
Create a file named `topics.csv`:
```csv
id,topic
1,Black Holes
2,Quantum Computing
```

Run:
```bash
batchprompt generate topics.csv "Write a haiku about {{topic}}" --model gpt-4o
```

---

## 🌊 The Data Pipeline

Understanding how data flows between steps and plugins is key to building complex agents.

### 1. Variable Syntax (CamelCase)
BatchPrompt automatically converts column names and plugin names into **Handlebars variables**.
*   **CSV Columns:** `product_name` → `{{product_name}}`
*   **Plugins:** Kebab-case flags map to camelCase variables.
    *   `--web-search` results are available as `{{webSearch}}`.
    *   `--image-search` results are available as `{{imageSearch}}`.
    *   `--website-agent` results are available as `{{websiteAgent}}`.

### 2. Execution Order & Chaining
Within a single step, plugins run **sequentially** before the LLM. This allows you to feed the output of one plugin into the configuration of another.

**The Flow:**
```text
[Row Data] 
    ⬇️
[Plugin 1: Web Search] 
    ➔ Populates {{webSearch}}
    ⬇️
[Plugin 2: Website Agent] 
    ➔ Can use {{webSearch.0.link}} as input URL
    ➔ Populates {{websiteAgent}}
    ⬇️
[LLM Prompt]
    ➔ Can use {{webSearch}}, {{websiteAgent}}, and {{Row Data}}
```

### 3. Workspace vs. Export
*   **Workspace (Transient):** By default, plugin results are available *only* to the current step's prompt and subsequent plugins in that step. They are discarded after the step finishes.
*   **Export (Persistent):** Use the `--[plugin]-export` flag (e.g., `--web-search-export`) to merge the result into the Row Data. This makes it available to **future steps** and saves it in the final CSV output.

---

## 🔌 Plugins

Plugins add capabilities to the AI. They run *before* the LLM generates its response.

### 🌐 Web Search (RAG)
Searches Google (via Serper), retrieves content, and optionally summarizes it.

*   **Variable:** `{{webSearch}}` (Array of results)
*   **Enable:** `--web-search-query "latest news about {{topic}}"`
*   **Chaining:** Use `{{webSearch.0.link}}` to get the top result's URL.
*   **Options:**
    *   `--web-search-limit 5`: Number of results.
    *   `--web-search-mode markdown`: Fetches full page content. (Options: `none`, `markdown`, `html`).
    *   `--web-search-export`: Merges results into row data.

### 🖼️ Image Search
Finds images on the web.

*   **Variable:** `{{imageSearch}}` (Array of objects with `imageUrl`, `title`)
*   **Enable:** `--image-search-query "{{landmark}}"`
*   **AI Selection:** Use `--image-select-prompt "Pick the best photo"` to have an AI judge select the best image.
*   **Options:**
    *   `--image-search-limit 10`: Images to fetch.
    *   `--image-search-sprite-size 4`: Grid size for AI selection.

### 🕷️ Website Agent (Scraper)
Crawls a specific URL and extracts structured data matching a JSON schema.

*   **Variable:** `{{websiteAgent}}` (The extracted JSON object)
*   **Enable:** `--website-agent-url "{{url}}"`
*   **Schema:** `--website-agent-schema "schema.json"` (Defines extraction structure).
*   **Depth:** `--website-agent-depth 1` (0 = Single Page, 1 = Follow links).

### 🎨 Style Scraper
Captures screenshots and extracts CSS styles from interactive elements.

*   **Variable:** `{{styleScraper}}` (Object: `{ desktop: "path/to/img.jpg", mobile: "...", css: "..." }`)
*   **Enable:** `--style-scrape-url "{{url}}"`
*   **Options:**
    *   `--style-scrape-mobile`: Capture mobile viewport.
    *   `--style-scrape-interactive`: Click buttons/inputs to capture states.

---

## 🛠️ Core Strategies

### 💥 The "Explode" Strategy
Turn one row into many. If your LLM returns a JSON Array, `--explode` creates a new task for every item in that array.

**Visualization:**
```text
Step 1 (Search):  [ "Apple" ]
                     |
                 Generates: ["iPhone", "Mac", "iPad"]
                     |
Step 2 (Explode): [Row: iPhone]  [Row: Mac]  [Row: iPad]
```

### 🧪 Verification & Feedback
BatchPrompt can run a shell command to verify output. If it fails, the error is fed back to the AI to fix it.

*   `--verify-command "node {{file}}"`: Runs this command. If exit code != 0, it retries.
*   `--feedback-loops 2`: Number of times to critique and regenerate.

### 🏆 Candidates & Judging
Generate multiple variations and pick the best one.

*   `--candidates 4`: Generate 4 versions in parallel.
*   `--judge-prompt "Pick the most creative one"`: An AI Judge evaluates all 4.

---

## 📚 Cookbook / Scenarios

### Scenario 1: The "Chain" (Search -> Scrape -> Write)
**Goal:** Find a company's website, scrape their "About" page, and write a bio.

**Input (`companies.csv`):**
```csv
name
"OpenAI"
"Anthropic"
```

**Command:**
```bash
batchprompt generate companies.csv bio_prompt.md \
  --web-search-query "official website for {{name}}" \
  --web-search-limit 1 \
  --website-agent-url "{{webSearch.0.link}}" \
  --website-agent-schema "schemas/about_us.json" \
  --model gpt-4o
```
**Explanation:**
1.  **Web Search** runs first. It finds the URL.
2.  **Website Agent** runs second. It uses `{{webSearch.0.link}}` from the previous plugin to know where to scrape.
3.  **LLM** runs last. It uses `{{websiteAgent}}` (the scraped data) to write the bio defined in `bio_prompt.md`.

### Scenario 2: The "Deep Researcher" (Explode)
**Goal:** Take a topic, find 3 sub-topics, and generate a report for each.

**Command:**
```bash
# Step 1: Find sub-topics (Returns JSON Array)
# Step 2: Write report for each sub-topic
batchprompt generate topics.csv \
  step1_find_subtopics.md \
  step2_write_report.md \
  --json-schema-1 schemas/subtopics.json \
  --explode-1 \
  --web-search-query-2 "details about {{subtopic}}" \
  --output-2 "reports/{{topic}}/{{subtopic}}.md"
```

---

## ⚙️ Configuration Reference

### Global & IO
| Flag | Description |
| :--- | :--- |
| `-c, --concurrency` | Max concurrent LLM requests (Default: 20). |
| `--task-concurrency` | Max concurrent rows processed (Default: 100). |
| `--tmp-dir` | Directory for temp files (Default: `.tmp`). |
| `--data-output` | Path to save the processed CSV/JSON data file. |

### Model Control
| Flag | Description |
| :--- | :--- |
| `-m, --model` | Model ID (e.g., `gpt-4o`, `claude-3-5-sonnet`). |
| `--temperature` | Creativity (0.0 - 1.0). |
| `--thinking-level` | For reasoning models (o1/o3). `low`, `medium`, `high`. |
| `-s, --system` | System prompt (File path or text). |

### Flow Control
| Flag | Description |
| :--- | :--- |
| `--explode` | Split array results into multiple rows for the next step. |
| `--candidates` | Number of parallel variations to generate. |
| `--judge-prompt` | Prompt for the AI judge to select the best candidate. |
| `--feedback-loops` | Number of critique/refine cycles (Default: 0). |
| `--verify-command` | Command to validate output (triggers retry on failure). |
| `--output` | Template for output file path (e.g., `out/{{id}}.txt`). |
| `--output-column` | Save result to a column in the data file. |
| `--export` | Merge the result into the row data for future steps. |

### Plugin: Web Search
| Flag | Description |
| :--- | :--- |
| `--web-search-query` | The search query. |
| `--web-search-limit` | Max results (Default: 5). |
| `--web-search-mode` | `none`, `markdown`, `html`. |
| `--web-search-export` | Save results to CSV. |

### Plugin: Website Agent
| Flag | Description |
| :--- | :--- |
| `--website-agent-url` | URL to scrape. |
| `--website-agent-schema` | JSON Schema for extraction. |
| `--website-agent-depth` | 0 (Single) or 1 (Subpages). |

### Step-Specific Overrides
Append `-{stepNumber}` to almost any flag to configure multi-step pipelines.
*   `--model-2 gpt-4o`
*   `--web-search-query-1 "..."`
*   `--output-3 "final.md"`

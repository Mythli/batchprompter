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

## 🧠 Core Concepts: Data Flow & Variables

BatchPrompt relies entirely on **Variables**. Understanding how data flows between steps is key to building complex agents.

### 1. Input Variables
Every column in your input CSV/JSON becomes a variable.
*   **CSV:** `id, product_name` -> `{{id}}`, `{{product_name}}`
*   **Usage:** You can use these in prompts, file paths, and even configuration flags.

### 2. Step Outputs
When a step finishes, its result is stored.
*   **Default:** The result is stored in `{{modelOutput}}`.
*   **Named Column:** Use `--output-column my_summary` to save the result to `{{my_summary}}`.
*   **History:** You can access results from specific steps using the `steps` array: `{{steps.[0].modelOutput}}` (0-based index).

### 3. Plugin Data
Plugins (like Web Search) inject their data into variables.
*   **Default:** `{{web-search}}`, `{{image-search}}`, `{{website-agent}}`.
*   **Merging:** Use `--web-search-merge` to flatten the result into your main data.
    *   *Example:* If the website agent finds `{"email": "..."}`, merging lets you use `{{email}}` directly in the next step.

### 4. Dynamic Configuration
You can use variables to change *how* the tool runs per row.
*   **Dynamic Schemas:** `--json-schema "schemas/{{category}}.json"` (Loads different validation schemas based on row data).
*   **Dynamic Prompts:** `batchprompt generate data.csv "prompts/{{type}}.md"` (Loads different prompt files).

---

## 🔌 Plugins

Plugins add capabilities to the AI. They run *before* the LLM generates its response, providing context.

### 🌐 Web Search (RAG)
Searches Google (via Serper), retrieves content, and optionally summarizes it.

*   **Enable:** `--web-search-query "latest news about {{topic}}"`
*   **Auto-Query:** Use `--web-query-prompt "Generate a search query for..."` to let the AI decide what to search.
*   **Options:**
    *   `--web-search-limit 5`: Number of results.
    *   `--web-search-query-count 3`: Number of queries to generate when using Auto-Query.
    *   `--web-search-mode markdown`: Fetches the full page content and converts to Markdown. (Options: `none`, `markdown`, `html`).
    *   `--web-search-merge`: Merges results into the row data.

### 🖼️ Image Search
Finds images on the web to use as reference or context.

*   **Enable:** `--image-search-query "{{landmark}}"`
*   **Auto-Query:** Use `--image-query-prompt "Find images of..."` to let the AI generate search queries.
*   **AI Selection:** Use `--image-select-prompt "Pick the best photo"` to have an AI judge select the best image from the results.
*   **Options:**
    *   `--image-search-limit 10`: How many images to fetch.
    *   `--image-search-query-count 3`: Number of queries to generate when using Auto-Query.
    *   `--image-search-sprite-size 4`: How many images to show the AI at once during selection.

### 🕷️ Website Agent (Scraper)
Crawls a specific URL and extracts structured data matching a JSON schema.

*   **Enable:** `--website-agent-url "{{url}}"`
*   **Schema:** `--website-agent-schema "schema.json"` (Defines what to extract).
*   **Depth:** `--website-agent-depth 1` (0 = Single Page, 1 = Follow links to subpages).
*   **Prompts:** You can override the internal prompts using `--website-agent-extract-data-prompt`.

### 🎨 Style Scraper
Captures screenshots (Desktop & Mobile) and extracts CSS styles from interactive elements (buttons, inputs). Great for UI/UX analysis.

*   **Enable:** `--style-scrape-url "{{url}}"`
*   **Options:**
    *   `--style-scrape-mobile`: Also capture a mobile viewport screenshot.
    *   `--style-scrape-interactive`: Click buttons/inputs to capture `:hover` and `:focus` states and computed CSS.
    *   `--style-scrape-resolution 1920x1080`.

---

## 🛠️ Advanced Logic

### 💥 The "Explode" Strategy
Turn one row into many. If your LLM returns a JSON Array, `--explode` creates a new task for every item in that array.

**Example:**
1.  **Input:** 1 Row (`topic: "Fruit"`).
2.  **Step 1:** Generates `["Apple", "Banana", "Cherry"]`.
3.  **Flag:** `--explode` is set.
4.  **Step 2:** Runs **3 times**, once for each fruit.

### 🧪 Verification & Self-Healing
BatchPrompt can run a shell command to verify the output. If it fails, the error is fed back to the AI to fix it.

*   `--verify-command "node {{file}}"`: Runs this command. If exit code != 0, it retries.
*   `--json-schema schema.json`: Enforces valid JSON structure. Retries if parsing fails.

### 🏆 Candidates & Judging
Generate multiple variations and pick the best one.

*   `--candidates 4`: Generate 4 versions in parallel.
*   `--judge-prompt "Pick the most creative one"`: An AI Judge evaluates all 4 and selects the winner.
*   `--skip-candidate-command`: Only run post-process commands on the *winner*, not the drafts.

---

## 📚 Workflow Scenarios

### Scenario 1: The "Deep Researcher" (Web Search + Explode)
**Goal:** Take a list of companies, find their latest news, and generate a separate report for each news item.

```bash
batchprompt generate companies.csv \
  step1_find_news.md \
  step2_write_report.md \
  --web-search-query-1 "Latest news for {{company_name}}" \
  --web-search-mode-1 markdown \
  --json-schema-1 news_items_schema.json \
  --explode-1 \
  --output-2 "reports/{{company_name}}/{{news_title}}.md" \
  --model gpt-4o
```

### Scenario 2: The "UI/UX Auditor" (Style Scraper + Vision)
**Goal:** Audit a list of websites for mobile responsiveness and color contrast.

```bash
batchprompt generate sites.csv audit_prompt.md \
  --style-scrape-url "{{url}}" \
  --style-scrape-mobile \
  --style-scrape-interactive \
  --output "audits/{{domain}}.md" \
  --model google/gemini-2.0-flash-exp
```
*Note: Requires a multimodal model like Gemini 2.0 or GPT-4o.*

### Scenario 3: The "Code Generator" (Verification Loop)
**Goal:** Write a Python script and ensure it actually runs.

```bash
batchprompt generate tasks.csv code_prompt.md \
  --output "src/{{filename}}.py" \
  --verify-command "python {{file}}" \
  --feedback-loops 2 \
  --model claude-3-5-sonnet
```

---

## ⚙️ Configuration Reference

### General Flags
| Flag | Description |
| :--- | :--- |
| `-c, --concurrency` | Max concurrent LLM requests (Default: 20). |
| `--task-concurrency` | Max concurrent rows processed (Default: 100). |
| `--tmp-dir` | Directory for temp files (Default: `.tmp`). |
| `--data-output` | Path to save the processed CSV/JSON data file. |

### Model Configuration
| Flag | Description |
| :--- | :--- |
| `-m, --model` | Model ID (e.g., `gpt-4o`, `claude-3-5-sonnet`). |
| `--temperature` | Creativity (0.0 - 1.0). |
| `--thinking-level` | For reasoning models (o1/o3). `low`, `medium`, `high`. |
| `-s, --system` | System prompt (File path or text). |

### Output Control
| Flag | Description |
| :--- | :--- |
| `-o, --output` | Template for output file path (e.g., `out/{{id}}.txt`). |
| `--output-column` | Save result to a column in the data file. |
| `--export` | Merge the result into the row data for future steps. |
| `--command` | Shell command to run *after* success (e.g., `cp {{file}} ./deploy`). |

### Logic & Flow
| Flag | Description |
| :--- | :--- |
| `--explode` | Split array results into multiple rows for the next step. |
| `--candidates` | Number of parallel variations to generate. |
| `--judge-prompt` | Prompt for the AI judge to select the best candidate. |
| `--feedback-loops` | Number of critique/refine cycles (Default: 0). |
| `--verify-command` | Command to validate output (triggers retry on failure). |

### Environment Variables
| Variable | Description |
| :--- | :--- |
| `BATCHPROMPT_OPENAI_API_KEY` | API Key (OpenAI/OpenRouter). |
| `BATCHPROMPT_OPENAI_BASE_URL` | API Base URL. |
| `BATCHPROMPT_SERPER_API_KEY` | Key for Serper.dev (Google Search). |
| `SERPER_CONCURRENCY` | Max parallel search requests (Default: 5). |
| `PUPPETEER_CONCURRENCY` | Max parallel browser instances (Default: 3). |
| `CACHE_ENABLED` | Set to `false` to disable caching. |

### Step-Specific Overrides
For multi-step pipelines, you can override almost any configuration flag for a specific step by appending the step number (1-10) to the flag name.

**Common Overrides:**
*   `--model-2 gpt-4o` (Use a different model for step 2)
*   `--temperature-1 0.7` (Set creativity for step 1)
*   `--system-2 "You are a critic..."` (Different system prompt for step 2)
*   `--output-3 "final_report.md"` (Specific output path for step 3)
*   `--json-schema-1 schema.json` (Validation schema for step 1)
*   `--web-search-query-1 "..."` (Search query for step 1)

**Pattern:**
`--{flag}-{stepNumber} {value}`

# BatchPrompt

BatchPrompt is a command-line tool that lets you generate text and images in bulk using AI.

## ⚠️ The Core Concept: Data-Driven Generation

BatchPrompt is designed for bulk operations. It **requires** a data file (CSV or JSON) to function. You cannot run it without one.

*   **The Data File (Mandatory):** You provide a CSV file where every row represents one task.
*   **Variables:** The column headers in your CSV (e.g., `id`, `topic`, `name`) become variables (placeholders) available throughout the process.
*   **One Row = One Output:** The tool iterates through every row in your CSV and generates a unique result for it.
    *   **File Output:** Save each result as a separate file (e.g., `out/1.txt`).
    *   **Column Output:** Write the result back into the CSV as a new column.

### Where can I use these variables?
You can use `{{variable_name}}` placeholders in almost every argument and file content:

1.  **Inside Prompt Files:** Dynamically insert data into your text prompts.
    *   *Example:* `Write a blog post about {{topic}}.`
2.  **Inside System Prompts:** Customize the AI persona per row.
    *   *Example:* `You are an expert in {{industry}}.`
3.  **In Prompt File Paths:** Dynamically choose which prompt file to load based on the data.
    *   *Example:* `prompts/{{type}}.md` (If type is "vip", it loads `prompts/vip.md`).
4.  **In Output Paths:** Organize your results into folders.
    *   *Example:* `output/{{category}}/{{id}}.txt`

**Example:**
If your CSV has 50 rows of products, BatchPrompt will generate 50 product descriptions.

---

## 1. Prerequisite: Installing Node.js (For Beginners)

To run this tool, you need **Node.js** and **npm** (Node Package Manager) installed on your computer.

### Windows / macOS
1.  Go to the official [Node.js website](https://nodejs.org/).
2.  Download the **LTS (Long Term Support)** version.
3.  Run the installer and follow the on-screen instructions.
4.  Once finished, open your Command Prompt (cmd.exe), PowerShell, or Terminal.
5.  Type the following to verify it worked:
    ```bash
    node -v
    npm -v
    ```
    You should see version numbers appear (e.g., `v20.11.0`).

### Linux (Ubuntu/Debian)
Open your terminal and run these commands:

```bash
# 1. Update your package list
sudo apt update

# 2. Install Node.js and npm
sudo apt install nodejs npm

# 3. Verify installation
node -v
npm -v
```

---

## 2. Installation

Once Node.js is installed, you can install BatchPrompt globally. This allows you to run the `batchprompt` command from any folder on your computer.

### Option A: Install from NPM (Recommended)
```bash
npm install -g batchprompt
```

### Option B: Install from Source (If developing)
Open your terminal inside this project folder and run:
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Link the command globally
npm link
```
Now you can simply type `batchprompt` in your terminal to play with it.

---

## 3. Setup: API Key & OpenRouter (Recommended)

While this tool works with OpenAI-compatible APIs, we **highly recommend using [OpenRouter](https://openrouter.ai/)**. OpenRouter allows you to use models from Google (Gemini), Anthropic (Claude), and OpenAI using a single API key.

**Crucially**, this tool uses the unified Chat API for image generation. It relies on **Text+Image models** (like Gemini 3 or generally Multimodal models). It does **not** support the standalone DALL-E endpoint. To use these modern models effectively, you should configure the Base URL for OpenRouter.

### Configuration for OpenRouter (Best Practice)

1.  Get your key from [openrouter.ai](https://openrouter.ai/).
2.  Set the Base URL to OpenRouter.
3.  Set your API Key.

*Mac/Linux:*
```bash
export BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export BATCHPROMPT_OPENAI_API_KEY="sk-or-v1-..."
```

*Windows (PowerShell):*
```powershell
$env:BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
$env:BATCHPROMPT_OPENAI_API_KEY="sk-or-v1-..."
```

### Variable Priority & Fallbacks
BatchPrompt looks for variables in this order. If you have existing OpenAI variables set, specific `BATCHPROMPT_` keys will override them.

| Setting | Preferred Variable | Fallback 1 | Fallback 2 |
| :--- | :--- | :--- | :--- |
| **Base URL** | `BATCHPROMPT_OPENAI_BASE_URL` | `OPENAI_BASE_URL` | `AI_API_URL` |
| **API Key** | `BATCHPROMPT_OPENAI_API_KEY` | `OPENAI_API_KEY` | `AI_API_KEY` |
| **Model** | `BATCHPROMPT_OPENAI_MODEL` | `OPENAI_MODEL` | `MODEL` |

### Advanced Configuration (Environment Variables)
You can further configure BatchPrompt using these environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `CACHE_ENABLED` | `true` | Set to `false` to disable caching of API responses. |
| `SQLITE_PATH` | `.cache.sqlite` | Path to the SQLite file used for caching. |
| `GPT_MAX_CONVERSATION_CHARS` | (None) | Limit the number of characters in the conversation history (truncates older messages). |

---

## 4. Comprehensive Workflows

These 3 scenarios demonstrate the full power of BatchPrompt, combining multiple features into realistic workflows.

### Scenario 1: The "Content Machine"
**Features:** Text Generation, Dynamic Prompt Paths, Feedback Loops, Data Enrichment.

**Goal:** Generate SEO-optimized product descriptions. We use different prompt files based on the product category, force the AI to critique and refine its own work, and save the result to both a file and a new column in the CSV.

**Command:**
```bash
batchprompt generate \
  products.csv \
  "prompts/{{category}}.md" \
  --output "output/{{category}}/{{id}}_desc.md" \
  --output-column "description_summary" \
  --feedback-loops 1 \
  --feedback-prompt "Critique the draft for SEO keywords and persuasive tone. Identify any fluff." \
  --model google/gemini-3-pro-preview
```

**What happens:**
1.  **Dynamic Loading:** For a row where `category` is "electronics", it loads `prompts/electronics.md`.
2.  **Draft & Refine:** The AI generates a draft. Then, the **Feedback Model** critiques it. The AI generates a final version based on the critique.
3.  **Dual Output:**
    *   Saves the full text to `output/electronics/123_desc.md`.
    *   Adds the text to a new column `description_summary` in `products_processed.csv`.

---

### Scenario 2: The "Art Director"
**Features:** Image Search (RAG), Image Generation, Candidate Generation, AI Judging.

**Goal:** Create the perfect marketing visual for travel destinations. Instead of hallucinating details, the AI searches for real photos of the location, uses them as reference, generates 4 variations, and picks the best one.

**Command:**
```bash
batchprompt generate \
  destinations.csv \
  prompt.md \
  --output "output/{{city}}.png" \
  --aspect-ratio "16:9" \
  --image-search-prompt "Find high-quality, scenic photography of {{city}} landmarks." \
  --image-select-prompt "Select the most breathtaking landscape shot." \
  --candidates 4 \
  --judge-model "google/gemini-3-pro-preview" \
  --judge-prompt "Select the most photorealistic image with the best lighting. Return the index of the best candidate." \
  --model google/gemini-3-pro-image-preview
```

**What happens:**
1.  **Research:** The AI searches the web for images of the city and selects the best reference photo.
2.  **Generate x4:** It generates 4 different images in parallel, using the reference photo for accuracy.
3.  **Judge:** The Judge Model looks at all 4 candidates and picks the winner based on your criteria.
4.  **Save:** Only the winning image is saved.

---

### Scenario 3: The "Software Engineer"
**Features:** Multi-Step Workflow, JSON Schema, System Prompt Overrides, Self-Healing Code.

**Goal:** A robust code generation pipeline. Step 1 defines a technical specification (JSON). Step 2 writes the code. If the code fails to run, the AI fixes it automatically.

**Command:**
```bash
batchprompt generate \
  features.csv \
  step1_spec.md \
  step2_code.md \
  --output-2 "src/{{id}}.ts" \
  --system-prompt-1 "You are a Product Manager." \
  --json-schema-1 spec_schema.json \
  --system-prompt-2 "You are a Senior TypeScript Developer." \
  --verify-command-2 "npx tsc --noEmit {{file}}" \
  --model google/gemini-3-pro-preview
```

**What happens:**
1.  **Step 1 (Spec):** Acts as a Product Manager. Generates a JSON spec validated against `spec_schema.json`.
2.  **Step 2 (Code):** Acts as a Developer. Reads the spec from Step 1 and writes TypeScript code.
3.  **Verify & Heal:** BatchPrompt runs `npx tsc` on the generated file. If it fails, the error is fed back to the AI, which generates a fix. This repeats up to 3 times until the code compiles.

---

## 5. Command Flags Reference

Here is an explanation of the flags used above.

| Flag / Argument | Example | Description |
| :--- | :--- | :--- |
| **Argument 1** | `data.csv` | **Required.** The path to your data file (CSV or JSON). The first row of a CSV must be headers (e.g., `id,name`). |
| **Argument 2+** | `prompt.md` | **Optional.** One or more text files (or directories) containing your prompt templates. Directories can contain Text, Images, or Audio. |
| `-o` / `--output` | `out/{{id}}.txt` | Template for saving results to individual files. |
| `--output-column` | `summary` | Save the result into a specific column in the data file instead of separate files. |
| `--data-output` | `data_new.csv` | Path to save the processed data file (used with `--output-column`). Defaults to `*_processed.csv`. |
| `-s` / `--system` | `system.md` | The path to a system prompt file or directory (sets the AI behavior/persona). |
| `-S` / `--schema` | `schema.json` | Path to a JSON Schema file. Enforces valid JSON output and enables auto-retry on validation failure. |
| `--verify-command` | `"node {{file}}"` | A shell command to verify the output. Use `{{file}}` as a placeholder. Enables auto-retry on failure. |
| `-c` / `--concurrency` | `10` | How many items to process at once. Defaults to 20. Lower this if you hit Rate Limits. |
| `-m` / `--model` | `google/gemini...` | Which AI model to use. **Note:** For images, you must use a unified text+image model. |
| `--aspect-ratio` | `16:9` | Triggers **Text+Image mode**. Common values: `1:1`, `16:9`, `3:2`. |
| `--image-search-query` | `"cats"` | Raw search query for image search. |
| `--image-search-prompt` | `"Find images of..."` | Prompt to generate search queries dynamically. |
| `--image-select-prompt` | `"Pick the best..."` | Prompt for the AI to select the best image from results. |
| `--image-search-limit` | `10` | Images to fetch per query. |
| `--image-search-select` | `1` | How many images to select. |
| `--image-search-query-count` | `3` | Number of search queries to generate. |
| `--image-search-sprite-size` | `4` | Number of images per grid sent to the AI judge. |

### Step-Specific Overrides (Flags ending in -N)
When running a multi-step generation (by providing multiple prompt files), you can configure each step individually.
BatchPrompt supports overrides for steps 1 through 10. Simply append the step number to the flag.

**Available flags (replace `N` with `1`, `2`, ... `10`):**

| Flag Pattern | Example | Description |
| :--- | :--- | :--- |
| `--system-prompt-N` | `--system-prompt-2` | Override system prompt for step N. |
| `--json-schema-N` | `--json-schema-2` | Override JSON Schema for step N. |
| `--verify-command-N` | `--verify-command-2` | Override verification command for step N. |
| `--output-N` | `--output-2` | Override output file path for step N. |
| `--output-column-N` | `--output-column-2` | Override output column for step N. |
| `--aspect-ratio-N` | `--aspect-ratio-2` | Override aspect ratio for step N. |
| `--image-search-query-N` | `--image-search-query-2` | Override search query for step N. |
| `--image-search-prompt-N` | `--image-search-prompt-2` | Override search prompt for step N. |
| `--image-select-prompt-N` | `--image-select-prompt-2` | Override select prompt for step N. |

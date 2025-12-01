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

## 4. Usage Examples

We will use the files located in the `examples` folder to demonstrate how this works.

### Scenario 1: Generating Blog Content (Text)
**Goal:** Generate a blog post. We will chain two prompts: first to generate headlines, then to write an intro.

**The Input Files:**

1.  **Data:** [examples/1-text/data.csv](examples/1-text/data.csv)
    ```csv
    id,industry
    1,Dachdecker
    ...
    ```
2.  **Prompt 1 (Headlines):** [examples/1-text/prompt1.md](examples/1-text/prompt1.md)
    ```text
    Schreibe 5 creative und klickstarke Überschriften für einen Blogartikel über das Thema: {{industry}}.
    ```
3.  **Prompt 2 (Intro):** [examples/1-text/prompt2.md](examples/1-text/prompt2.md)
    ```text
    Wähle die beste Überschrift aus und schreibe dazu eine fesselnde Einleitung...
    ```

**Run this command:**

```bash
batchprompt generate \
  examples/1-text/data.csv \
  examples/1-text/prompt1.md \
  examples/1-text/prompt2.md \
  --system examples/1-text/system.md \
  --output "output/text/{{industry}}/blog_draft.md" \
  --concurrency 5 \
  --model google/gemini-3-pro-preview
```

**What happens here?**
1.  **Fill Data**: The tool reads row 1 ("Dachdecker") and replaces `{{industry}}` in both prompt files.
2.  **`--output`**: It saves the results into folders named after the industry.
    *   Prompt 1 Output -> `output/text/Dachdecker/blog_draft_1.md` (Headlines)
    *   Prompt 2 Output -> `output/text/Dachdecker/blog_draft_2.md` (Introduction)
    *   *Note: Numerical suffixes (`_1`, `_2`) are added automatically for multiple prompts.*

---

### Scenario 2: Dynamic Prompt Paths
**Goal:** Use different prompt files for different rows based on data (e.g., customer segments).

**The Input:**
*   **Data:** `examples/2-dynamic-prompts/data.csv` (contains `segment` column: "vip", "new", etc.)
*   **Prompts:** `examples/2-dynamic-prompts/prompts/vip.md`, `examples/2-dynamic-prompts/prompts/new.md`...

**Run this command:**
```bash
batchprompt generate \
  examples/2-dynamic-prompts/data.csv \
  "examples/2-dynamic-prompts/prompts/{{segment}}.md" \
  --output "output/dynamic-prompts/{{id}}.txt" \
  --model google/gemini-3-pro-preview
```

**What happens here?**
*   For a row where `segment` is "vip", BatchPrompt loads `examples/2-dynamic-prompts/prompts/vip.md`.
*   For a row where `segment` is "new", it loads `examples/2-dynamic-prompts/prompts/new.md`.

---

### Scenario 3: Using Directories for Prompts
**Goal:** Organize complex prompts by splitting them into multiple files within a folder.

**The Input:**
*   **Prompt Directory:** `examples/3-directory-prompt/prompt/`
    *   `01_instruction.md`
    *   `02_details.md`

**Run this command:**
```bash
batchprompt generate \
  examples/3-directory-prompt/data.csv \
  examples/3-directory-prompt/prompt/ \
  --system examples/3-directory-prompt/system/ \
  --output "output/directory-prompt/{{id}}.txt" \
  --model google/gemini-3-pro-preview
```

**What happens here?**
*   BatchPrompt detects that `examples/3-directory-prompt/prompt/` is a directory.
*   It reads all files inside, sorts them alphabetically, and concatenates them into **one single prompt**.
*   This works for both **User Prompts** and **System Prompts** (`--system`).

---

### Scenario 4: Generating Images & Multimodal Inputs
**Goal:** Create realistic stock photos using a model that supports text-to-image output via chat (e.g., Gemini 3).

**The Input Files:**

1.  **Data:** [examples/4-image/data.csv](examples/4-image/data.csv)
    ```csv
    id,industry
    1,Dachdecker
    2,Zahnarztpraxis
    ...
    ```
2.  **Prompt Directory:** `examples/4-image/prompt/`
    *   `2_person.jpg` (Reference image)
    *   `2_prompt.md` (Text prompt)

**Note on Inputs:** You can include **Images** (`.jpg`, `.png`) and **Audio** (`.mp3`, `.wav`) files in your prompt directory. BatchPrompt will send them to the model (if the model supports multimodal input).

**Run this command:**

```bash
batchprompt generate \
  examples/4-image/data.csv \
  examples/4-image/prompt \
  --output "output/images/{{id}}_{{industry}}.png" \
  --aspect-ratio 1:1 \
  --model google/gemini-3-pro-image-preview
```

**What happens here?**
1.  **`--model google/gemini-3-pro-image-preview`**: We specifically request a model known on OpenRouter to support text+image generation.
2.  **`--aspect-ratio 1:1`**: This flag signals BatchPrompt to use the `modalities: ['image', 'text']` feature.
3.  **Prompt Directory**: The tool reads the directory `examples/4-image/prompt`. It finds the image file and the text file, combines them into a multimodal prompt, and sends them to the AI. This allows you to use reference images for consistent character generation.
4.  **Dynamic Output (`--output`)**: We use **two** placeholders in the filename for organization.
    *   Row 1 Output -> `output/images/1_Dachdecker.png`
    *   Row 2 Output -> `output/images/2_Zahnarztpraxis.png`

---

### Scenario 5: Structured Data (JSON Schema)
**Goal:** Generate strictly valid JSON output (e.g., for an API or database import).

**The Input Files:**
1.  **Data:** `examples/5-json-schema/data.csv`
2.  **Prompt:** `examples/5-json-schema/prompt.md` ("Create a character profile...")
3.  **Schema:** `examples/5-json-schema/schema.json` (A standard JSON Schema definition)

**Run this command:**
```bash
batchprompt generate \
  examples/5-json-schema/data.csv \
  examples/5-json-schema/prompt.md \
  --output "output/json-schema/{{id}}.json" \
  --schema examples/5-json-schema/schema.json \
  --model google/gemini-3-pro-preview
```

**What happens here?**
*   **Validation**: The tool forces the AI to output JSON matching `schema.json`.
*   **Auto-Retry**: If the AI generates invalid JSON, BatchPrompt automatically feeds the error back to the AI and retries (up to 3 times).
*   **Output**: The result is saved as a `.json` file.

---

### Scenario 6: Multi-Step Workflows with Overrides
**Goal:** A complex chain where Step 1 generates a Character (JSON) and Step 2 generates a Weapon (JSON) with different rules.

**Run this command:**
```bash
batchprompt generate \
  examples/5-json-schema/data.csv \
  examples/5-json-schema/prompt.md \
  examples/5-json-schema/prompt_2.md \
  --output "output/json-schema-multistep/{{id}}/result.json" \
  --system examples/5-json-schema/system.md \
  --schema examples/5-json-schema/schema.json \
  --system-prompt-2 examples/5-json-schema/system_2.md \
  --json-schema-2 examples/5-json-schema/schema_2.json \
  --model google/gemini-3-pro-preview
```

**What happens here?**
1.  **Step 1 (Character)**: Uses `prompt.md`, `system.md`, and validates against `schema.json`.
2.  **Step 2 (Weapon)**: Uses `prompt_2.md`.
    *   **Overrides System**: Instead of the general system prompt, it uses `system_2.md`.
    *   **Overrides Schema**: Instead of the character schema, it validates against `schema_2.json`.

---

### Scenario 7: Command Verification (Self-Healing Code)
**Goal:** Generate code and verify it runs correctly. If it fails, feed the error back to the AI to fix it.

**The Input:**
*   **Data:** `examples/6-verify-command/data.csv`
*   **Prompt:** `examples/6-verify-command/prompt.md` ("Write a script...")
*   **Verify Script:** `examples/6-verify-command/verify.sh` (Checks syntax or runs the code)

**Run this command:**
```bash
batchprompt generate \
  examples/6-verify-command/data.csv \
  examples/6-verify-command/prompt.md \
  --output "output/verify-command/{{id}}/script.js" \
  --verify-command "examples/6-verify-command/verify.sh {{file}}" \
  --model google/gemini-3-pro-preview
```

**What happens here?**
1.  **Generate**: The AI generates the code.
2.  **Verify**: BatchPrompt runs `verify.sh output/verify-command/1/script.js`.
3.  **Self-Heal**: If `verify.sh` exits with an error (non-zero code), BatchPrompt takes the error output (stderr/stdout), sends it back to the AI ("Your code failed with: ..."), and asks for a fix.
4.  **Retry**: This repeats up to 3 times until the verification passes.

---

### Scenario 8: Enriching Data (Column Output)
**Goal:** Instead of creating hundreds of text files, you want to add a "summary" column to your existing CSV.

**The Input:**
*   **Data:** `products.csv` (Columns: `id`, `description`)
*   **Prompt:** `prompt.md` ("Summarize this description in 10 words: {{description}}")

**Run this command:**
```bash
batchprompt generate \
  products.csv \
  prompt.md \
  --output-column "summary" \
  --data-output "products_with_summary.csv" \
  --model google/gemini-3-pro-preview
```

**What happens here?**
1.  **Generate**: The AI generates a summary for each row.
2.  **Update**: It adds a new column named `summary` to the data.
3.  **Save**: It saves the new CSV file to `products_with_summary.csv`.

---

### Scenario 9: AI-Powered Image Search & Selection
**Goal:** Instead of generating an image from scratch, find a real image from the web, curate it using AI, and use it in your workflow.

**Prerequisite:** You need a [Serper.dev](https://serper.dev/) API key.
```bash
export SERPER_API_KEY="your-key"
```

**The Input:**
*   **Data:** `destinations.csv` (Column: `city`)
*   **Prompt:** `prompt.md` ("Write a travel guide for {{city}}...")

**Run this command:**
```bash
batchprompt generate \
  destinations.csv \
  prompt.md \
  --output "output/{{city}}/guide.md" \
  --image-search-prompt "Find high-quality, scenic photography of {{city}} landmarks. No text overlay." \
  --image-select-prompt "Select the most breathtaking landscape shot. It must be high resolution and free of watermarks." \
  --image-search-limit 10 \
  --image-search-query-count 3 \
  --model google/gemini-3-pro-preview
```

**What happens here?**
1.  **Generate Queries**: The AI uses your `--image-search-prompt` to generate 3 diverse search queries (e.g., "Paris Eiffel Tower sunset", "Paris Louvre museum exterior").
2.  **Search**: It fetches 10 images per query using Serper.dev.
3.  **Sprite Generation**: It combines the found images into grid "sprites".
4.  **AI Selection**: It sends these grids to the Vision AI with your `--image-select-prompt`. The AI "looks" at the search results and picks the best one based on your criteria.
5.  **Integration**: The selected image is downloaded and provided to the main prompt context (or saved if using `--output`).

**Fine-tuning Control:**
*   `--image-search-query-count`: How many different search queries to generate (default: 3).
*   `--image-search-sprite-size`: How many images to pack into one grid for the AI to review (default: 4).

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

# BatchPrompt

BatchPrompt is a command-line tool that lets you generate text and images in bulk using AI. You feed it a data file (CSV or JSON) and a template, and it produces output for every row in your data.

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

---

## 4. Usage Examples

We will use the files located in the `test-data` folder to demonstrate how this works.

### Scenario 1: Generating Blog Content (Text)
**Goal:** Generate a blog post. We will chain two prompts: first to generate headlines, then to write an intro.

**The Input Files:**

1.  **Data:** [test-data/text/data.csv](test-data/text/data.csv)
    ```csv
    id,industry
    1,Dachdecker
    ...
    ```
2.  **Prompt 1 (Headlines):** [test-data/text/prompt1.md](test-data/text/prompt1.md)
    ```text
    Schreibe 5 creative und klickstarke Überschriften für einen Blogartikel über das Thema: {{industry}}.
    ```
3.  **Prompt 2 (Intro):** [test-data/text/prompt2.md](test-data/text/prompt2.md)
    ```text
    Wähle die beste Überschrift aus und schreibe dazu eine fesselnde Einleitung...
    ```

**Run this command:**

```bash
batchprompt generate \
  test-data/text/data.csv \
  test-data/text/prompt1.md \
  test-data/text/prompt2.md \
  --system test-data/text/system.md \
  --output "output/text/{{industry}}/blog_draft.md" \
  --concurrency 5
```

**What happens here?**
1.  **Fill Data**: The tool reads row 1 ("Dachdecker") and replaces `{{industry}}` in both prompt files.
2.  **`--output`**: It saves the results into folders named after the industry.
    *   Prompt 1 Output -> `output/text/Dachdecker/blog_draft_1.md` (Headlines)
    *   Prompt 2 Output -> `output/text/Dachdecker/blog_draft_2.md` (Introduction)
    *   *Note: Numerical suffixes (`_1`, `_2`) are added automatically for multiple prompts.*

---

### Scenario 2: Generating Images (Unified Models)
**Goal:** Create realistic stock photos using a model that supports text-to-image output via chat (e.g., Gemini 3).

**The Input Files:**

1.  **Data:** [test-data/image/data.csv](test-data/image/data.csv)
    ```csv
    id,industry
    1,Dachdecker
    2,Zahnarztpraxis
    ...
    ```
2.  **Prompt:** [test-data/image/prompt.md](test-data/image/prompt.md)
    ```text
    Erstelle ein echtes, reales {{industry}} Bild, dass exakt zu folgender Branche passt: {{industry}}...
    ```

**Run this command:**

```bash
batchprompt generate \
  test-data/image/data.csv \
  test-data/image/prompt.md \
  --output "output/images/{{id}}_{{industry}}.png" \
  --aspect-ratio 1:1 \
  --model google/gemini-3-pro-image-preview
```

**What happens here?**
1.  **`--model google/gemini-3-pro-image-preview`**: We specifically request a model known on OpenRouter to support text+image generation.
2.  **`--aspect-ratio 1:1`**: This flag signals BatchPrompt to use the `modalities: ['image', 'text']` feature.
3.  **Dynamic Output (`--output`)**: We use **two** placeholders in the filename for organization.
    *   Row 1 Output -> `output/images/1_Dachdecker.png`
    *   Row 2 Output -> `output/images/2_Zahnarztpraxis.png`

---

## 5. Command Flags Reference

Here is an explanation of the flags used above.

| Flag / Argument | Example | Description |
| :--- | :--- | :--- |
| **Argument 1** | `data.csv` | **Required.** The path to your data file (CSV or JSON). The first row of a CSV must be headers (e.g., `id,name`). |
| **Argument 2+** | `prompt.md` | **Optional.** One or more text files containing your prompt templates. Use `{{header_name}}` to insert data from your CSV. |
| `-o` / `--output` | `out/{{id}}.txt` | **Required.** The output path template. You can use `{{variable}}` here to dynamically name folders or files based on CSV data. |
| `-s` / `--system` | `system.md` | The path to a system prompt file (sets the AI behavior/persona). |
| `-c` / `--concurrency` | `10` | How many items to process at once. Defaults to 10. Lower this if you hit Rate Limits. |
| `-m` / `--model` | `google/gemini-3...` | Which AI model to use. **Note:** For images, you must use a unified text+image model (e.g., Gemini 3, Nano Banana). Standalone DALL-E is not supported. |
| `--aspect-ratio` | `16:9` | Triggers **Text+Image mode**. Common values: `1:1`, `16:9`, `3:2`. |

### Dynamic File Naming
You can use any column header from your CSV in the output path argument (`--output`).

*   **CSV Headers**: `id`, `category`, `country`
*   **Output Flag**: `-o "results/{{country}}/{{category}}/item_{{id}}.txt"`
*   **Result**: `results/Germany/Food/item_5.txt`

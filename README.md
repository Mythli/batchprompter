# BatchPrompt ⚡️

**BatchPrompt** is a CLI tool for building **AI pipelines**. It automates the process of chaining LLMs, web search, browser scrapers, validation, deduping, and Gmail actions to process data in bulk.

Unlike a chatbot, BatchPrompt is **data-driven**: it reads CSV/JSON rows from stdin or config data, and for every row it executes a pipeline of steps to generate files, structured data, or side effects like sending email.

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
export BATCHPROMPT_SERPER_API_KEY="your-serper-key" # Required for webSearch/imageSearch
```

**Windows (PowerShell):**
```powershell
$env:BATCHPROMPT_OPENAI_BASE_URL="https://openrouter.ai/api/v1"
$env:BATCHPROMPT_OPENAI_API_KEY="sk-or-..."
$env:BATCHPROMPT_SERPER_API_KEY="your-serper-key"
```

---

## 📚 Tutorials

The best way to learn BatchPrompt is by doing. We have prepared step-by-step tutorials for common use cases.

| Tutorial | Difficulty | What you'll learn |
| :--- | :--- | :--- |
| **[1. RAG Image Generation](apps/batchprompt-cli/examples/01-rag-imagegen/README.md)** | 🟢 Easy | How to use **Search** to find reference images and guide **Image Generation**. |
| **[2. B2B Lead Generation](apps/batchprompt-cli/examples/02-lead-gen/readme.md)** | 🔴 Advanced | How to build a **Multi-Stage Pipeline** (Find -> Enrich) with **JSON config**. |
| **[3. SEO Rank Tracker](apps/batchprompt-cli/examples/03-seo-rank/README.md)** | 🟡 Medium | How to use **Web Search** and **AI Selectors** to analyze search results. |
| **[4. Website Style Analyzer](apps/batchprompt-cli/examples/04-describe-website-css/README.md)** | 🟡 Medium | How to use the **Style Scraper** (Vision + CSS) to reverse-engineer design systems. |
| **[5. Logo Downloader](apps/batchprompt-cli/examples/05-logo-downloader/README.md)** | 🟡 Medium | How to use the **Logo Scraper** to extract brand assets (logos, favicons, colors). |

---

## 🧠 How It Works

Think of BatchPrompt as an **assembly line** for your data.

1.  **Input:** You pipe CSV/JSON rows into `batchprompt generate`, or provide data in config. Each row is a "raw material".
2.  **The Pipeline:** You define a series of **Steps**.
    *   **Fetch:** Plugins (Web Search, Image Search, Website Agent, Style Scraper, Logo Scraper, Load Data) go out and get data.
    *   **Context:** The LLM receives the Row Data + Plugin Data.
    *   **Generate:** The LLM creates content (Text, Code, JSON).
3.  **Output:** The result is saved to a file OR merged back into the row for the next step.

### The Data Flow

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
```

---

## 🔌 Plugins

BatchPrompt comes with powerful built-in plugins to give your LLM access to the real world.

*   **Web Search** (`webSearch`): Google Search via Serper, with optional content fetching and AI selection.
*   **Image Search** (`imageSearch`): Find and download images for RAG or analysis.
*   **Website Agent** (`websiteAgent`): Browser-based extraction of structured data from websites.
*   **Style Scraper** (`styleScraper`): Captures screenshots and computed CSS for design analysis.
*   **Logo Scraper** (`logoScraper`): Extracts logos, favicons, and brand colors from websites.
*   **Validation / Dedupe / Load Data** (`validation`, `dedupe`, `loadData`): Clean, validate, merge, and expand rows.
*   **Gmail Sender / Replier** (`gmailSender`, `gmailReplier`): Send or reply to Gmail threads from pipeline rows.

---

## ⚙️ Configuration

You can run BatchPrompt using simple CLI flags or robust YAML/JSON configuration files.

**CLI Mode (Simple):**
```bash
cat data.csv | batchprompt generate "Write a summary of {{topic}}" --model ~google/gemini-flash-latest
```

**Config Mode (Advanced):**
```bash
cat data.csv | batchprompt generate --config config.json
```

See the [Tutorials](#-tutorials) for examples of both methods.

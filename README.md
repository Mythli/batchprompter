# BatchPrompt ⚡️

**BatchPrompt** is a CLI tool for building **AI pipelines**. It automates the process of chaining LLMs, Web Search, and Scrapers to process data in bulk.

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

## 📚 Tutorials

The best way to learn BatchPrompt is by doing. We have prepared step-by-step tutorials for common use cases.

| Tutorial | Difficulty | What you'll learn |
| :--- | :--- | :--- |
| **[1. RAG Image Generation](examples/01-rag-imagegen/README.md)** | 🟢 Easy | How to use **Search** to find reference images and guide **Image Generation**. |
| **[2. B2B Lead Generation](examples/02-lead-gen/README.md)** | 🔴 Advanced | How to build a **Multi-Stage Pipeline** (Find -> Enrich) with **JSON config**. |
| **[3. SEO Rank Tracker](examples/03-seo-rank/README.md)** | 🟡 Medium | How to use **Web Search** and **AI Selectors** to analyze search results. |
| **[4. Website Style Analyzer](examples/04-describe-website-css/README.md)** | 🟡 Medium | How to use the **Style Scraper** (Vision + CSS) to reverse-engineer design systems. |

---

## 🧠 How It Works

Think of BatchPrompt as an **assembly line** for your data.

1.  **Input:** You feed it a CSV file. Each row is a "raw material".
2.  **The Pipeline:** You define a series of **Steps**.
    *   **Fetch:** Plugins (Web Search, Image Search) go out and get data.
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

*   **Web Search**: Google Search (Serper) with content fetching.
*   **Image Search**: Find and download images for RAG or analysis.
*   **Website Agent**: Autonomous scraper that navigates websites to extract specific data (JSON).
*   **Style Scraper**: Captures screenshots (Desktop/Mobile) and computed CSS for design analysis.

---

## ⚙️ Configuration

You can run BatchPrompt using simple CLI flags or robust YAML/JSON configuration files.

**CLI Mode (Simple):**
```bash
batchprompt generate data.csv "Write a summary of {{topic}}" --model google/gemini-3-flash
```

**Config Mode (Advanced):**
```bash
batchprompt generate data.csv --config pipeline.yaml
```

See the [Tutorials](#-tutorials) for examples of both methods.

# batchprompt package

This package contains the core BatchPrompt pipeline runtime. The CLI wraps this runtime, but the important behavior lives here: config parsing, row orchestration, plugin execution, model calls, output merging/explosion, artifact handling, and event-driven logging.

## Current Flow

1. Raw config is parsed into a global pipeline config.
2. Global defaults are merged into each step.
3. Each input row becomes a `StepRow`.
4. Plugin rows run `prepare()` before the model call and `postProcess()` after it.
5. Step output is merged into the row, written to a column, ignored, or exploded into multiple rows.

Model config can be supplied as a global string shorthand:

```json
{ "model": "google/gemini-3-flash-preview" }
```

or as a nested object:

```json
{
  "model": {
    "model": "google/gemini-3-flash-preview",
    "prompt": "Summarize {{topic}}"
  }
}
```

## Built-in Plugin Types

- `webSearch`
- `imageSearch`
- `websiteAgent`
- `styleScraper`
- `logoScraper`
- `urlExpander`
- `validation`
- `dedupe`
- `loadData`
- `gmailSender`
- `gmailReplier`

Some plugins depend on optional services. For example, `webSearch` and `imageSearch` require Serper, browser-based plugins require Puppeteer, and Gmail plugins require `GMAIL_EMAIL` / `GMAIL_PASSWORD`.

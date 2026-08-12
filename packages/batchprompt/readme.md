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
{ "model": "~google/gemini-flash-latest" }
```

or as a nested object:

```json
{
  "model": {
    "model": "~google/gemini-flash-latest",
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

Some plugins depend on optional services. `webSearch` supports Serper, DataForSEO, or Puppeteer, `imageSearch` requires Serper, browser-based plugins require Puppeteer, and Gmail plugins require `GMAIL_EMAIL` / `GMAIL_PASSWORD`. Set `provider: "dataforseo"` (recommended) or `"puppeteer"` together with `includeAds: true` to return sponsored Google results; the Serper provider rejects `includeAds`.

DataForSEO uses HTTP Basic authentication. Configure either the API credential pair:

```dotenv
BATCHPROMPT_DATAFORSEO_LOGIN=your-api-login
BATCHPROMPT_DATAFORSEO_PASSWORD=your-api-password
```

or its pre-encoded Base64 token:

```dotenv
BATCHPROMPT_DATAFORSEO_AUTH_TOKEN=your-base64-login-password
```

Then select it in a web-search plugin:

```json
{
  "type": "webSearch",
  "provider": "dataforseo",
  "includeAds": true,
  "query": "car insurance quotes",
  "gl": "us",
  "hl": "en"
}
```

---
name: batchprompt-basics
description: Build, run, inspect, and troubleshoot BatchPrompt CLI pipelines. Use with the relevant specialist skill whenever a request involves batchprompt, CSV/JSON row pipelines, Handlebars fields, JSON/YAML configs, model steps, plugins, output modes, candidates, judge selection, images, audio, or CLI overrides.
---

# BatchPrompt Basics

Use the local source and examples as the authority:

```bash
BATCHPROMPT_ROOT=/home/tobias/Development/batchprompt
BATCHPROMPT_CLI="$BATCHPROMPT_ROOT/apps/batchprompt-cli/dist/index.js"
```

Read `README.md`, then the closest example under
`apps/batchprompt-cli/examples/`. When documentation and implementation differ,
inspect the plugin's Zod schema under `packages/batchprompt/src/plugins/`.

## Understand the data flow

Treat each CSV/JSON item as one row context:

1. Read rows from stdin, inline config data, or `loadData`.
2. Merge global defaults into each step.
3. Run plugin `prepare()` work such as search, scraping, validation, or dedupe.
4. Run the step model when configured.
5. Run plugin `postProcess()` work such as Gmail actions.
6. Merge, assign, ignore, explode, or write the result according to `output`.

Use Handlebars paths such as `{{webSearch.domain}}` to consume earlier results.
Later steps can use named model columns created by earlier steps.

## Know the supported surface

BatchPrompt supports:

- model chains for text/code and schema-constrained output;
- candidates plus judge selection;
- image and audio modalities supported by the chosen model;
- `webSearch`, `imageSearch`, `websiteAgent`, `styleScraper`, `logoScraper`;
- `urlExpander`, `validation`, `dedupe`, `loadData`;
- `gmailSender` and `gmailReplier`;
- output to CSV columns, merged rows, exploded rows, or artifact paths.

Canonical examples:

- simple model chain and judge: `examples/05-simple-chain/`
- image RAG: `examples/01-rag-imagegen/`
- lead pipeline: `examples/02-lead-gen/`
- SEO search: `examples/03-seo-rank/`
- website style and logo extraction: `examples/04-describe-website-css/` and
  `examples/05-logo-downloader/`
- influencer search/enrichment: `examples/08-influencer-linktree/`
- website image search/editing: `examples/09-rag-website-image-search/`
- Gmail replies: `examples/03-email-reply/`

Resolve these paths below `apps/batchprompt-cli/`.

## Run the CLI directly

Simple prompt:

```bash
printf '%s\n' '{"topic":"Example"}' |
  batchprompt generate 'Summarize {{topic}}'
```

Config pipeline:

```bash
batchprompt generate --config "$CONFIG" < "$INPUT"
```

Useful controls include `--input-limit`, `--input-offset`, `--output-limit`,
`--output-offset`, `--data-output-path`, `--output-tmp-dir`, `--concurrency`, and
`--task-concurrency`. Use numbered overrides such as `--2-prompt` or
`--2-web-search-max-pages` for a specific step.

Prefer configs for repeatable pipelines and CLI overrides for deliberate run-specific
changes. Do not add wrapper scripts unless the user requests a reusable wrapper.

## Protect credentials and outputs

Use the global `batchprompt` installation when its default `.env` is intended. For a
specific environment file, run the built CLI with `DOTENV_CONFIG_PATH`; never
`source` a secret file and never print credentials.

Inspect input schema, config, and output target before running. Keep debug/tmp output
until the run is accepted. Treat the result file—not process startup—as proof of
completion. Verify row counts, expected columns, failures, and plugin statuses.

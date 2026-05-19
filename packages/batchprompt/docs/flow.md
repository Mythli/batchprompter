# BatchPrompt Flow

BatchPrompt processes rows through a configured sequence of steps.

1. Raw config is parsed and normalized.
2. Input rows come from stdin, inline config data, or a `loadData` plugin.
3. Global defaults are merged into each step.
4. Each row is wrapped in a `StepRow`.
5. Step plugins run `prepare()` to fetch, scrape, validate, dedupe, or otherwise enrich context before the model call.
6. The step model runs when configured.
7. Step plugins run `postProcess()` for side effects and final row updates.
8. Output handling merges results into the row, writes a column, ignores the result, writes artifacts, or explodes arrays into multiple rows.

The CLI command `batchprompt generate` reads CSV/JSON rows from stdin and then applies the config or CLI flags:

```bash
cat data.csv | batchprompt generate --config config.json
```

Step-specific CLI flags are prefixed with the step number, for example `--2-output-limit 3`.

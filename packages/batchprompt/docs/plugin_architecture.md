# Plugin Architecture

Plugins are registered by type name and validated against their own Zod schemas. The type names used in JSON/YAML configs are camelCase, for example `webSearch`, `urlExpander`, `websiteAgent`, and `gmailSender`.

Each plugin implements a plugin-level class and a row-level class:

- The plugin class owns config parsing and creates per-row plugin instances.
- The row class implements `prepare()` and/or `postProcess()`.

`prepare()` is used for work that should happen before the model call, such as search, scraping, loading rows, dedupe, or validation.

`postProcess()` is used for work that depends on the hydrated row and step result, such as sending Gmail messages or creating replies.

Plugins return `PluginResult` values. Output handling decides whether the result is merged into the row, written to a named column, ignored, or exploded into multiple rows.

Current built-in plugin types:

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

CLI-specific plugin types registered by `batchprompt-cli`:

- `shell-command`
- `codexAgent`

`codexAgent` runs during `prepare()`, returns the Codex final message as text or parsed JSON, and therefore participates in the same merge/column/ignore output handling as core plugins. Its output is available to Handlebars templates in subsequent steps.

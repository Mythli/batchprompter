# Codex Agent

This example runs one ephemeral, read-only Codex agent per CSV row, validates its final response against an inline JSON Schema, stores the parsed object in the `codex` column, and feeds that object into a regular model step.

Prerequisites:

```bash
codex login status
pnpm --filter batchprompt-cli build
```

Run from `apps/batchprompt-cli`:

```bash
cat examples/10-codex-agent/data.csv |
  node dist/index.js generate --config examples/10-codex-agent/config.yaml
```

The second step accesses `{{codex.summary}}` and `{{codex.recommendation}}`. Use a separate step for consumers because BatchPrompt hydrates all Handlebars templates for a step before executing that step.

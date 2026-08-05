---
name: batchprompt-lead-research
description: Research, select, deduplicate, validate, and enrich leads or other web entities with BatchPrompt webSearch and websiteAgent. Use for localized provider searches, official-site selection, directory exclusion, domain dedupe, public contact or offer extraction, small test runs, and full research/enrichment pipelines.
---

# BatchPrompt Lead Research

Apply `$batchprompt-basics`. Read the canonical lead example at
`apps/batchprompt-cli/examples/02-lead-gen/` and the influencer example at
`apps/batchprompt-cli/examples/08-influencer-linktree/` when relevant.

## Define evidence and exclusions

Translate the request into explicit inclusion criteria and exclusions. Require direct
evidence from an official source when selecting businesses. Do not infer missing
offers, people, roles, or contact data.

Check existing result files before starting a costly search. Use DuckDB or another
deterministic table engine for domain normalization, customer exclusion, dedupe,
sampling, and counts.

## Search with `webSearch`

Use either:

- `query` for a direct Handlebars-rendered search; or
- `queryModel` to generate multiple queries from the row context.

Use `selectModel` to select only evidence-backed results. Use `compressModel` only
when compressed page content is required. Configure `limit`, `queryCount`,
`maxPages`, `dedupeStrategy`, `gl`, `hl`, and `mode` intentionally.

`mode: "none"` keeps search metadata only. `mode: "markdown"` or `"html"` fetches
page content. Use `output.mode: "merge"` with `explode: true` when each selected
result should become its own row.

Start with a small representative input/output limit. Inspect retained and rejected
samples before increasing the scope.

## Enrich with `websiteAgent`

Set:

- `url` to a Handlebars URL such as `{{webSearch.link}}`;
- `schema` to the smallest JSON Schema needed downstream;
- `budget` to the maximum visited pages;
- `batchSize` to the desired page concurrency;
- optional `navigatorModel`, `extractModel`, and `mergeModel`.

Put a `validation` plugin after extraction. Use its `target`, JSON `schema`, and
`failMode` to reject rows that do not meet mandatory evidence or completeness rules.
Do not fabricate replacements for dropped rows.

Use additional `webSearch` steps after enrichment only when a verified extracted
field supplies the query, as in the LinkedIn lookup from the full lead example.

## Quality gate

Before a full run:

1. run a small test;
2. inspect official URLs and extracted source evidence;
3. verify normalized unique domains and required fields;
4. inspect both accepted and excluded samples;
5. retain raw, debug, and failed rows;
6. obtain any approval required by the caller's project.

Report the exact input, config, output, accepted/rejected/skipped counts, and missing
field patterns. Do not generate or send outreach unless separately requested.

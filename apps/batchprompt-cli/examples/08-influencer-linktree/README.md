# Influencer Linktree Finder

Find up to 10 Linktree profile pages for influencers in each niche listed in `data.csv`, then enrich each profile with public name, contact info, and social/profile links.

## Prerequisites

This example uses the `webSearch` plugin, so your `.env` needs:

```bash
BATCHPROMPT_SERPER_API_KEY=...
```

You also need the usual model API key for the configured model.

## Run

Add influencer niches to `data.csv`, one per row:

```csv
niche
fitness
beauty
travel
```

Then run:

```bash
./examples/08-influencer-linktree/run.sh
```

Each CSV row is passed into the search prompts as `{{niche}}`.

Results are written to:

```bash
out/08-influencer-linktree/influencers.csv
```

The example intentionally runs Linktree page enrichment with low task and browser concurrency, headless Chrome, and an example-local cache under `out/08-influencer-linktree`. This avoids reusing stale blocked pages and reduces `429 Too Many Requests` responses. A validation plugin drops blocked or low-signal rows instead of adding replacement enrichment.

The output keeps the original `niche` and `webSearch.*` columns, then adds `websiteAgent.*` enrichment columns such as:

- `websiteAgent.influencerName`
- `websiteAgent.bio`
- `websiteAgent.contactEmail`
- `websiteAgent.contactPhone`
- `websiteAgent.contactFormUrl`
- `websiteAgent.collaborationUrl`
- `websiteAgent.instagramUrl`
- `websiteAgent.tiktokUrl`
- `websiteAgent.youtubeUrl`
- `websiteAgent.allProfileLinks`

After a row has a validated influencer name, the final step searches for a likely personal LinkedIn profile and writes it into:

- `linkedinSearch.title`
- `linkedinSearch.link`
- `linkedinSearch.snippet`
- `linkedinSearch.domain`

The final validation gate keeps only rows that have either a public email address or a LinkedIn personal profile URL. Rows without `websiteAgent.contactEmail`, `websiteAgent.linkedinUrl`, or `linkedinSearch.link` are dropped.

## Limit

The config uses `"limit": 10` on the `webSearch` plugin, so each niche returns at most 10 selected Linktree influencer profiles. The following enrichment step visits each selected Linktree page and extracts only public information visible there.

For a cheap test run with only the first niche:

```bash
./examples/08-influencer-linktree/run.sh --input-limit 1
```

You can tune quality in `config.json` by changing:

- `queryModel.prompt` to generate different search phrases
- `selectModel.prompt` to tighten or loosen what counts as an influencer
- `gl` / `hl` for country and language

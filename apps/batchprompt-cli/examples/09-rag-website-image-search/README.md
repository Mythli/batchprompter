# RAG Website Image Search

This example searches Google Images for strong source-photo matches for each course/offer row in a JSON data file, then creates visibly edited website-image candidates from the selected source image.

Flow: course data -> Google Images query generation -> visual source selection -> saved source images and metadata -> visible website-image edit candidates.

The edit step is source-locked: it keeps the source pose, camera, action, layout, pool geometry, and prop positions, while making controlled local changes to people, styling, and small scene details. Children are kept non-identifiable and safely supervised.

The reference search is German-first. It searches for concrete German swim-school motives and success moments such as `Seepferdchen`, `Fruehschwimmerabzeichen`, `Freischwimmer`, `Deutsches Schwimmabzeichen Bronze/Silber/Gold`, `Schwimmabzeichen`, `Urkunde`, `Abzeichen`, and Bavaria sample terms like `Fisch` and `Robbe` when relevant.

The example is split into three plain config files. Each config selects one source image and generates three candidates from it:

- `config.emotional-hero.json` - `16:9` wide trust/lesson hero
- `config.success-badge.json` - `4:5` portrait success/achievement image
- `config.group-background.json` - `21:9` ultra-wide group/background image

## Input

Default sample data:

```bash
examples/09-rag-website-image-search/data/schwimmschule-bavaria-courses.json
```

Input rows should include:

- `course_slug`
- `course_name`
- `audience`
- `skill_band`
- `source_notes`
- `visual_brief`
- `search_query_seed`

Useful environment variables:

- `DATA_FILE` - JSON array input file. Defaults to the Bavaria sample data.
- `CONFIG_FILE` - optional single config override. If omitted, `run.sh` runs all three configs.
- `VARIANTS` - optional comma-separated slot list. Defaults to `all`.

## Running

From `apps/batchprompt-cli`:

```bash
examples/09-rag-website-image-search/run.sh
```

Smoke test for the first course across all three image slots:

```bash
examples/09-rag-website-image-search/run.sh --input-limit 1
```

That runs:

- `config.emotional-hero.json`
- `config.success-badge.json`
- `config.group-background.json`

For one input row, expect 3 selected source-photo motives and 9 generated candidates total: 3 candidates per slot.

Run only the portrait success image:

```bash
examples/09-rag-website-image-search/run.sh --variants success-badge --input-limit 1
```

Run only the wide group/background image:

```bash
examples/09-rag-website-image-search/run.sh --variants group-background --input-limit 1
```

Run two slots:

```bash
examples/09-rag-website-image-search/run.sh --variants emotional-hero,success-badge --input-limit 1
```

Each run processes the first input row, selects 1 source-photo motive for that config, and writes 3 edited candidates for that selected source.

The script forwards all extra arguments to `batchprompt generate`, so CLI overrides work normally:

```bash
examples/09-rag-website-image-search/run.sh --input-limit 1 --log-level debug
```

Required environment:

- `BATCHPROMPT_OPENAI_API_KEY`, `OPENAI_API_KEY`, or `AI_API_KEY`
- `BATCHPROMPT_SERPER_API_KEY` or `SERPER_API_KEY`

Outputs are written under:

```bash
out/09-rag-website-image-search/
```

Generated candidates and the selected source copy are written to:

```bash
out/09-rag-website-image-search/images/<course-slug>/<slot>/source.jpg
out/09-rag-website-image-search/images/<course-slug>/<slot>/source.png
out/09-rag-website-image-search/images/<course-slug>/<slot>/candidate_0.png
out/09-rag-website-image-search/images/<course-slug>/<slot>/candidate_1.png
out/09-rag-website-image-search/images/<course-slug>/<slot>/candidate_2.png
```

Only one of `source.jpg` or `source.png` is created, depending on the selected source file. Selected source debug artifacts and metadata are also kept under `_source/row_*/step_*/imageSearch/selected/`.
Each config writes its own CSV shortlist, for example `out/09-rag-website-image-search/results-emotional-hero.csv`.

Branding, readable text, logos, organization names, uniform lettering, and watermarks are allowed in source images when the scene match is strong.

## Schwimmschule Bavaria Sample Context

The included sample data is based on Schwimmschule Bavaria's official pages:

- Children levels: https://www.schwimmschule-bavaria.de/levels/
- Course overview: https://www.schwimmschule-bavaria.de/alle-kurse-erklart/
- Adult courses: https://www.schwimmschule-bavaria.de/alle-kursorte-buchen-erwachsene/
- Women-only courses: https://www.schwimmschule-bavaria.de/frauenschwimmkurs/
- Private lessons: https://www.schwimmschule-bavaria.de/privatunterricht/
- Holiday course: https://www.schwimmschule-bavaria.de/schwimmkurs-ferien-haidhausen/
- Mermaid event: https://www.schwimmschule-bavaria.de/meerjungfrauschwimmen/
- Mermaid birthday event: https://www.schwimmschule-bavaria.de/geburtstag-meerjungfrauschwimmen/

Core child progression:

- Level 1 Anfaenger: beginner trust, flotation aid, trainer close by.
- Level 2 Stabilisierung: short independent swim, reduced flotation aid, confidence-building with trainer support.
- Level 3 Fortgeschritten: stronger movement, longer swim, breathing/coordination, visible progress.
- Level 4 Ausdauer: lane/endurance feeling, steady swimming, safety-focused coaching.
- Level 5 Technik: technique refinement, crawl/breaststroke/backstroke coaching, more athletic framing.
- Champions/Leistungskurs: team and competition energy, relay or medal moment, performance without unsafe rescue drama.

Adult, women-only, private, holiday, and mermaid rows use the same search flow adapted to their category.

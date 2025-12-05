#!/bin/bash

npx tsx src/index.ts generate examples/13-industry-search/data.csv \
  --web-search-query "Find official website for {{name}}" \
  --web-search-limit 1 \
  --web-search-mode none \
  --website-agent-url "{{web-search.0.link}}" \
  --website-agent-schema "examples/13-industry-search/schema.json" \
  --website-agent-depth 1 \
  --website-agent-merge

# Logo Downloader Example

> **⚠️ This example requires the `logo-scraper` plugin which is not yet available in the new architecture.**

This example previously demonstrated the Logo Scraper plugin which extracts brand logos, favicons, and colors from websites.

## Status

The `logo-scraper` plugin needs to be migrated to the new `BasePlugin`/`BasePluginRow` architecture before this example can run. The config has been simplified to a placeholder.

## Original Concepts

- **HTML/CSS Analysis**: Finds `<img>` tags, `background-image` CSS, inline SVGs, favicons
- **AI Scoring**: Vision Model scores each candidate logo (1-10)
- **Deduplication**: Groups visually identical logos, keeps highest resolution
- **Brand Color Extraction**: Identifies primary brand colors from screenshot

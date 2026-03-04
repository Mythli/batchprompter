# Logo Downloader Example

This example demonstrates the Logo Scraper plugin which extracts brand logos, favicons, and colors from websites.

## Concepts

- **HTML/CSS Analysis**: Finds `<img>` tags, `background-image` CSS, inline SVGs, favicons
- **AI Scoring**: Vision Model scores each candidate logo (1-10)
- **Deduplication**: Groups visually identical logos, keeps highest resolution
- **Brand Color Extraction**: Identifies primary brand colors from screenshot

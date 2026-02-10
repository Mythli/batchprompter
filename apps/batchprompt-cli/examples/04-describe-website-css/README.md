# Website Style Analyzer Example

> **⚠️ This example requires the `style-scraper` plugin which is not yet available in the new architecture.**

This example previously demonstrated the Style Scraper plugin which captures the visual state of a website (screenshots, computed CSS) for Vision Model analysis.

## Status

The `style-scraper` plugin needs to be migrated to the new `BasePlugin`/`BasePluginRow` architecture before this example can run. The config has been simplified to a placeholder.

## Original Concepts

- **Desktop & Mobile Screenshots**: Captures at configurable resolutions
- **Interactive Element Capture**: Hovers over buttons/inputs/links, screenshots their states
- **Computed CSS Extraction**: Extracts non-default styles for each interactive element
- **Design System Analysis**: Vision Model synthesizes screenshots + CSS into a design description

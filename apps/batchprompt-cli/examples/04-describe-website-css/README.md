# Website Style Analyzer Example

This example demonstrates the Style Scraper plugin which captures the visual state of a website (screenshots, computed CSS) for Vision Model analysis.

## Concepts

- **Interactive Element Capture**: Hovers over buttons/inputs/links, screenshots their states
- **Computed CSS Extraction**: Extracts non-default styles for each interactive element
- **Composite Image Generation**: Creates a single labeled sprite sheet of all captured elements to save on LLM image processing costs
- **Design System Analysis**: Vision Model synthesizes the composite screenshot + CSS text into a comprehensive design description

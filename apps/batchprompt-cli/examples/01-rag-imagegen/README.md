# RAG Image Generation Example

This example demonstrates a Retrieval-Augmented Generation pipeline for images:
1. AI generates search queries for reference images
2. Google Images search retrieves candidates
3. A Vision Model selects the best reference
4. Image-to-image generation using the reference

## Original Concepts

- **Query Generation**: AI creates diverse search queries
- **Visual Search**: Google Images retrieval
- **AI Selection**: Vision Model scores candidates against a rubric
- **Explosion**: `output.explode: true` splits selected images into separate tasks
- **Candidates**: Multiple variations generated per reference
- **Shell Post-Processing**: ImageMagick resize via `shell-command` plugin

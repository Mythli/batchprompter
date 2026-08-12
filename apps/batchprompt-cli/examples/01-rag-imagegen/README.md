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
## Running

```bash
bash examples/01-rag-imagegen/run.sh
```

The config uses the `imageSearch` plugin and an image-capable model. It writes the generated artifact to `out/01-rag-imagegen/{{industry}}/HeroImage.jpg`.

To bias searches toward Google Images results with Creative Commons license metadata, add `"tbs": "sur:cl"` to the `imageSearch` plugin config, or pass `--image-search-tbs sur:cl` in CLI mode. This is a search filter, not a license guarantee; verify the source page before reuse.

import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class WebSearchDebugHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        // 1. Queries
        this.emitter.on('query:generated', async (data: { queries: string[] }) => {
            const savePath = path.join(this.baseDir, 'queries', `queries_${Date.now()}.json`);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });

        // 2. Scatter Results (Search)
        this.emitter.on('search:result', async (data: { query: string, page: number, results: any[], selection?: any }) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const filename = `scatter_${safeQuery}_p${data.page}_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'scatter', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });

        // 3. Reduce Results (Global Selection)
        this.emitter.on('selection:reduce', async (data: { input: any[], selection: any }) => {
            const filename = `reduce_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'reduce', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });

        // 4. Enrichment (Content Fetch)
        this.emitter.on('content:enrich', async (data: { url: string, rawContent: string, compressedContent: string }) => {
            const safeUrl = data.url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const filename = `enrich_${safeUrl}_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'enrich', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });

        // 5. Final Selection
        this.emitter.on('result:selected', async (data: { results: any[] }) => {
            const filename = `selected_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'selected', filename);
            await ArtifactSaver.save(JSON.stringify(data.results, null, 2), savePath);
        });
    }
}

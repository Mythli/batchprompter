import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class ImageSearchArtifactHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        // 1. Search Results (Metadata)
        this.emitter.on('search:result', async (data: { query: string, page: number, taskIndex: number, results: any[] }) => {
            const safeQuery = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const filename = `result_task${data.taskIndex}_${safeQuery}_p${data.page}.json`;
            const savePath = path.join(this.baseDir, 'search_results', filename);
            await ArtifactSaver.save(JSON.stringify(data.results, null, 2), savePath);
        });

        // 2. Sprites
        this.emitter.on('artifact:sprite', async (data: { buffer: Buffer, index: number, startNum: number, phase: string, taskIndex?: number }) => {
            let filename = `sprite_${data.phase}`;
            if (data.taskIndex !== undefined) filename += `_task${data.taskIndex}`;
            filename += `_${data.index}.jpg`;
            
            const savePath = path.join(this.baseDir, 'sprites', filename);
            await ArtifactSaver.save(data.buffer, savePath);
        });

        // 3. Candidates (Raw images used in sprites)
        this.emitter.on('artifact:candidate', async (data: { buffer: Buffer, index: number, originalIndex: number, phase: string, taskIndex?: number }) => {
            let filename = `candidate_${data.phase}`;
            if (data.taskIndex !== undefined) filename += `_task${data.taskIndex}`;
            filename += `_${data.index}.jpg`;

            const savePath = path.join(this.baseDir, 'candidates', filename);
            await ArtifactSaver.save(data.buffer, savePath);
        });

        // 4. Selected (Final Output)
        this.emitter.on('result:selected', async (data: { results: any[] }) => {
            const selectedDir = path.join(this.baseDir, 'selected');
            await Promise.all(data.results.map(async (result, i) => {
                const filename = `selected_${i + 1}.jpg`;
                const savePath = path.join(selectedDir, filename);
                await ArtifactSaver.save(result.buffer, savePath);
            }));
        });

        // 5. Queries
        this.emitter.on('query:generated', async (data: { queries: string[] }) => {
            const savePath = path.join(this.baseDir, 'search_results', `queries_${Date.now()}.json`);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });
    }
}

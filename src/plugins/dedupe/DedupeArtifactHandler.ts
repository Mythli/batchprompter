import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class DedupeArtifactHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        this.emitter.on('dedupe:result', async (data: { 
            id: string, 
            key: string, 
            isDuplicate: boolean 
        }) => {
            const filename = `dedupe_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'logs', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });
    }
}

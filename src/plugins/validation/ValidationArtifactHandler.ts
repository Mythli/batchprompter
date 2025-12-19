import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class ValidationArtifactHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        this.emitter.on('validation:result', async (data: { 
            schemaSource: string, 
            target?: string, 
            data: any, 
            valid: boolean, 
            errors?: string 
        }) => {
            const filename = `validation_${Date.now()}.json`;
            const savePath = path.join(this.baseDir, 'logs', filename);
            await ArtifactSaver.save(JSON.stringify(data, null, 2), savePath);
        });
    }
}

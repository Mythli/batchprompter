import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { ArtifactSaver } from '../../ArtifactSaver.js';

export class StyleScraperArtifactHandler {
    constructor(
        private baseDir: string,
        private emitter: EventEmitter
    ) {
        this.setupListeners();
    }

    private setupListeners() {
        this.emitter.on('artifact:captured', async (data: { 
            type: string, 
            subType?: string, 
            index?: number, 
            state?: string, 
            content: string | Buffer, 
            extension: string 
        }) => {
            let filename = '';
            let subDir = '';

            if (data.type === 'desktop' || data.type === 'mobile') {
                subDir = 'screenshots';
                filename = `${data.type}${data.extension}`;
            } else if (data.type === 'interactive') {
                subDir = 'interactive';
                filename = `composite${data.extension}`;
            } else if (data.type === 'css') {
                subDir = 'css';
                filename = `styles${data.extension}`;
            } else if (data.type === 'element') {
                subDir = 'interactive';
                filename = `${data.subType}_${data.index}_${data.state}${data.extension}`;
            }

            if (filename && subDir) {
                const savePath = path.join(this.baseDir, subDir, filename);
                await ArtifactSaver.save(data.content, savePath);
            }
        });
    }
}

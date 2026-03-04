import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from 'batchprompt';

export class FileSystemArtifactHandler {
    private pendingSaves: Promise<void>[] = [];

    constructor(
        private events: EventEmitter<BatchPromptEvents>,
        private baseDir: string
    ) {
        this.events.on('artifact:emit', (payload) => {
            const savePromise = this.handleArtifact(payload).catch(e => {
                console.error(`[ArtifactHandler] Failed to save artifact ${payload.filename}:`, e);
            });
            this.pendingSaves.push(savePromise);
        });
    }

    private async handleArtifact(payload: Parameters<BatchPromptEvents['artifact:emit']>[0]) {
        // Trust the filename from the library. 
        // If it's absolute, path.resolve will use it as-is.
        // If it's relative, it will be placed inside this.baseDir.
        const fullPath = path.resolve(this.baseDir, payload.filename);
        
        await this.ensureDir(fullPath);
        await fsPromises.writeFile(fullPath, payload.content);
    }

    private async ensureDir(filePath: string) {
        const dir = path.dirname(filePath);
        await fsPromises.mkdir(dir, { recursive: true });
    }

    public async waitForSaves() {
        await Promise.all(this.pendingSaves);
        this.pendingSaves = []; // Clear after waiting
    }
}

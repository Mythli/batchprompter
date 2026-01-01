import path from 'path';
import fsPromises from 'fs/promises';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../../core/events.js';

export class FileSystemArtifactHandler {
    constructor(
        private events: EventEmitter<BatchPromptEvents>,
        private baseDir: string
    ) {
        this.events.on('artifact', this.handleArtifact.bind(this));
    }

    private async handleArtifact(payload: Parameters<BatchPromptEvents['artifact']>[0]) {
        // Construct path: baseDir / row_step / filename
        // Note: payload.filename might contain subdirectories (e.g. "queries/q1.json")
        
        const rowStr = String(payload.row).padStart(3, '0');
        const stepStr = String(payload.step).padStart(2, '0');
        const stepDir = path.join(this.baseDir, `${rowStr}_${stepStr}`);
        
        let fullPath: string;

        // Heuristic: If filename starts with 'out/' or is absolute, treat as explicit output path
        // Otherwise, treat as temporary artifact inside stepDir
        if (path.isAbsolute(payload.filename) || payload.filename.startsWith('out/') || payload.filename.startsWith('out\\')) {
            fullPath = path.resolve(payload.filename);
        } else {
            fullPath = path.join(stepDir, payload.filename);
        }
        
        await this.ensureDir(fullPath);
        
        let content = payload.content;
        
        // Handle Data URIs and URLs if passed as string content
        if (typeof content === 'string') {
             if (content.startsWith('data:image')) {
                 try {
                     const base64Data = content.replace(/^data:image\/\w+;base64,/, "");
                     content = Buffer.from(base64Data, 'base64');
                 } catch (e) {
                     // Keep as string if conversion fails
                 }
             } else if (content.startsWith('http')) {
                 try {
                     const res = await fetch(content);
                     const arr = await res.arrayBuffer();
                     content = Buffer.from(arr);
                 } catch (e) {
                     // Keep as string (URL) if fetch fails
                 }
             }
        }

        await fsPromises.writeFile(fullPath, content);
    }

    private async ensureDir(filePath: string) {
        const dir = path.dirname(filePath);
        await fsPromises.mkdir(dir, { recursive: true });
    }
}

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
        // Construct path: baseDir / row_step / filename
        // Note: payload.filename might contain subdirectories (e.g. "queries/q1.json")
        
        const rowStr = String(payload.row).padStart(3, '0');
        const stepStr = String(payload.step).padStart(2, '0');
        const stepDir = path.join(this.baseDir, `${rowStr}_${stepStr}`);
        
        let fullPath: string;

        // Heuristic: If filename starts with 'out/' or is absolute, treat as explicit output path
        // Otherwise, treat as temporary artifact inside stepDir
        if (path.isAbsolute(payload.filename)) {
            fullPath = path.resolve(payload.filename);
        } else if (payload.filename.startsWith('out/') || payload.filename.startsWith('out\\')) {
            fullPath = path.resolve(payload.filename);
        } else {
            fullPath = path.join(stepDir, payload.filename);
        }
        
        await this.ensureDir(fullPath);
        
        let content = payload.content;
        
        // Handle Data URIs and URLs if passed as string content
        if (typeof content === 'string') {
             // Extract URL if it's wrapped in markdown: ![alt](url)
             const markdownImageMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
             if (markdownImageMatch) {
                 content = markdownImageMatch[1];
             } else {
                 // Fallback: extract first http URL if present and not a data URI
                 const urlMatch = content.match(/(https?:\/\/[^\s]+)/);
                 if (urlMatch && !content.startsWith('data:image')) {
                     content = urlMatch[1];
                 }
             }

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

    public async waitForSaves() {
        await Promise.all(this.pendingSaves);
        this.pendingSaves = []; // Clear after waiting
    }
}

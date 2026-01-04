import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from 'batchprompt';
export declare class FileSystemArtifactHandler {
    private events;
    private baseDir;
    constructor(events: EventEmitter<BatchPromptEvents>, baseDir: string);
    private handleArtifact;
    private ensureDir;
}
//# sourceMappingURL=FileSystemArtifactHandler.d.ts.map
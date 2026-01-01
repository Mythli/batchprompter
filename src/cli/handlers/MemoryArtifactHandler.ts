import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../../core/events.js';

export interface Artifact {
    path: string;
    content: string | Buffer;
    type: string;
}

export class MemoryArtifactHandler {
    public artifacts: Artifact[] = [];

    constructor(private events: EventEmitter<BatchPromptEvents>) {
        this.events.on('artifact', this.handleArtifact.bind(this));
    }

    private handleArtifact(payload: Parameters<BatchPromptEvents['artifact']>[0]) {
        this.artifacts.push({
            path: payload.filename,
            content: payload.content,
            type: payload.type
        });
    }
    
    clear() {
        this.artifacts = [];
    }
}

import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from '../core/events.js';
export interface Artifact {
    path: string;
    content: string | Buffer;
    type: string;
}
export declare class MemoryArtifactHandler {
    private events;
    artifacts: Artifact[];
    constructor(events: EventEmitter<BatchPromptEvents>);
    private handleArtifact;
    clear(): void;
}
//# sourceMappingURL=MemoryArtifactHandler.d.ts.map
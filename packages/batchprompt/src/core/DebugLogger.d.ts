import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';
export declare class DebugLogger {
    private events;
    constructor(events: EventEmitter<BatchPromptEvents>);
    private setupListeners;
}
//# sourceMappingURL=DebugLogger.d.ts.map
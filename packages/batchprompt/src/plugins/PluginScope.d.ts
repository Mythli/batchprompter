import { EventEmitter } from 'eventemitter3';
import { PluginExecutionContext } from './types.js';
export declare class PluginScope {
    private context;
    private pluginName;
    constructor(context: PluginExecutionContext, pluginName: string);
    emit(event: string, data?: any): void;
    artifact(payload: {
        type: string;
        filename: string;
        content: string | Buffer;
        tags?: string[];
        metadata?: Record<string, any>;
    }): void;
    bridge(emitter: EventEmitter): void;
}
//# sourceMappingURL=PluginScope.d.ts.map
import { EventEmitter } from 'eventemitter3';
import { PluginExecutionContext } from './types.js';

export class PluginScope {
    constructor(
        private context: PluginExecutionContext,
        private pluginName: string
    ) {}

    emit(event: string, data: any = {}) {
        this.context.emit('plugin:event', {
            row: this.context.row.index,
            step: this.context.stepIndex,
            plugin: this.pluginName,
            event,
            data
        });
    }

    artifact(payload: {
        type: string;
        filename: string;
        content: string | Buffer;
        tags?: string[];
        metadata?: Record<string, any>;
    }) {
        this.context.emit('plugin:artifact', {
            row: this.context.row.index,
            step: this.context.stepIndex,
            plugin: this.pluginName,
            type: payload.type,
            filename: payload.filename,
            content: payload.content,
            tags: payload.tags || [],
            metadata: payload.metadata
        });
    }

    bridge(emitter: EventEmitter) {
        const originalEmit = emitter.emit.bind(emitter);
        // @ts-ignore
        emitter.emit = (event: string | symbol, ...args: any[]) => {
            const result = originalEmit(event, ...args);
            if (typeof event === 'string') {
                this.emit(event, args[0] || {});
            }
            return result;
        };
    }
}

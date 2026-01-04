export class PluginScope {
    context;
    pluginName;
    constructor(context, pluginName) {
        this.context = context;
        this.pluginName = pluginName;
    }
    emit(event, data = {}) {
        this.context.emit('plugin:event', {
            row: this.context.row.index,
            step: this.context.stepIndex,
            plugin: this.pluginName,
            event,
            data
        });
    }
    artifact(payload) {
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
    bridge(emitter) {
        const originalEmit = emitter.emit.bind(emitter);
        // @ts-ignore
        emitter.emit = (event, ...args) => {
            const result = originalEmit(event, ...args);
            if (typeof event === 'string') {
                this.emit(event, args[0] || {});
            }
            return result;
        };
    }
}
//# sourceMappingURL=PluginScope.js.map
export class MemoryArtifactHandler {
    events;
    artifacts = [];
    constructor(events) {
        this.events = events;
        this.events.on('plugin:artifact', this.handleArtifact.bind(this));
    }
    handleArtifact(payload) {
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
//# sourceMappingURL=MemoryArtifactHandler.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryArtifactHandler = void 0;
var MemoryArtifactHandler = /** @class */ (function () {
    function MemoryArtifactHandler(events) {
        this.events = events;
        this.artifacts = [];
        this.events.on('plugin:artifact', this.handleArtifact.bind(this));
    }
    MemoryArtifactHandler.prototype.handleArtifact = function (payload) {
        this.artifacts.push({
            path: payload.filename,
            content: payload.content,
            type: payload.type
        });
    };
    MemoryArtifactHandler.prototype.clear = function () {
        this.artifacts = [];
    };
    return MemoryArtifactHandler;
}());
exports.MemoryArtifactHandler = MemoryArtifactHandler;

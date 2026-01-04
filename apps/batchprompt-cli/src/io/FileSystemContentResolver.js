"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSystemContentResolver = void 0;
var promises_1 = require("fs/promises");
var path_1 = require("path");
var FileSystemContentResolver = /** @class */ (function () {
    function FileSystemContentResolver() {
    }
    FileSystemContentResolver.prototype.readText = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, promises_1.default.readFile(filePath, 'utf-8')];
            });
        });
    };
    FileSystemContentResolver.prototype.resolve = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var stats, error_1, hasNewlines, hasSpaces, hasPathSeparators, isShort, hasExtension;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, promises_1.default.stat(input)];
                    case 1:
                        stats = _a.sent();
                        if (stats.isDirectory()) {
                            return [2 /*return*/, this.loadDirectory(input)];
                        }
                        if (stats.isFile()) {
                            return [2 /*return*/, this.loadFile(input)];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        hasNewlines = input.includes('\n');
                        hasSpaces = input.includes(' ');
                        if (!hasNewlines && !hasSpaces) {
                            hasPathSeparators = input.includes('/') || input.includes('\\');
                            isShort = input.length < 255;
                            hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(input);
                            if (hasPathSeparators || (isShort && hasExtension)) {
                                throw new Error("File not found: ".concat(input));
                            }
                        }
                        // Treat as raw text if it doesn't look like a file path
                        if (error_1.code === 'ENOENT' || error_1.code === 'ENAMETOOLONG' || error_1.code === 'EINVAL') {
                            return [2 /*return*/, [{ type: 'text', text: input }]];
                        }
                        throw error_1;
                    case 3: return [2 /*return*/, [{ type: 'text', text: input }]];
                }
            });
        });
    };
    FileSystemContentResolver.prototype.loadFile = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var type, content, buffer, base64, ext, mime, format;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        type = this.getPartType(filePath);
                        if (!(type === 'text')) return [3 /*break*/, 2];
                        return [4 /*yield*/, promises_1.default.readFile(filePath, 'utf-8')];
                    case 1:
                        content = _a.sent();
                        return [2 /*return*/, content.trim().length > 0 ? [{ type: 'text', text: content }] : []];
                    case 2: return [4 /*yield*/, promises_1.default.readFile(filePath)];
                    case 3:
                        buffer = _a.sent();
                        base64 = buffer.toString('base64');
                        ext = path_1.default.extname(filePath).toLowerCase();
                        if (type === 'image') {
                            mime = 'image/jpeg';
                            if (ext === '.png')
                                mime = 'image/png';
                            if (ext === '.gif')
                                mime = 'image/gif';
                            if (ext === '.webp')
                                mime = 'image/webp';
                            return [2 /*return*/, [{
                                        type: 'image_url',
                                        image_url: { url: "data:".concat(mime, ";base64,").concat(base64) }
                                    }]];
                        }
                        if (type === 'audio') {
                            format = ext === '.mp3' ? 'mp3' : 'wav';
                            return [2 /*return*/, [{
                                        type: 'input_audio',
                                        input_audio: { data: base64, format: format }
                                    }]];
                        }
                        return [2 /*return*/, []];
                }
            });
        });
    };
    FileSystemContentResolver.prototype.loadDirectory = function (dirPath) {
        return __awaiter(this, void 0, void 0, function () {
            var files, parts, currentTextBuffer, flushText, _i, files_1, file, filePath, stats, type, content, fileParts;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, promises_1.default.readdir(dirPath)];
                    case 1:
                        files = _a.sent();
                        files.sort();
                        parts = [];
                        currentTextBuffer = [];
                        flushText = function () {
                            if (currentTextBuffer.length > 0) {
                                parts.push({ type: 'text', text: currentTextBuffer.join('\n\n') });
                                currentTextBuffer = [];
                            }
                        };
                        _i = 0, files_1 = files;
                        _a.label = 2;
                    case 2:
                        if (!(_i < files_1.length)) return [3 /*break*/, 8];
                        file = files_1[_i];
                        if (file.startsWith('.'))
                            return [3 /*break*/, 7];
                        filePath = path_1.default.join(dirPath, file);
                        return [4 /*yield*/, promises_1.default.stat(filePath)];
                    case 3:
                        stats = _a.sent();
                        if (!stats.isFile())
                            return [3 /*break*/, 7];
                        type = this.getPartType(filePath);
                        if (!(type === 'text')) return [3 /*break*/, 5];
                        return [4 /*yield*/, promises_1.default.readFile(filePath, 'utf-8')];
                    case 4:
                        content = _a.sent();
                        if (content.trim().length > 0) {
                            currentTextBuffer.push(content);
                        }
                        return [3 /*break*/, 7];
                    case 5:
                        flushText();
                        return [4 /*yield*/, this.loadFile(filePath)];
                    case 6:
                        fileParts = _a.sent();
                        parts.push.apply(parts, fileParts);
                        _a.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 2];
                    case 8:
                        flushText();
                        return [2 /*return*/, parts];
                }
            });
        });
    };
    FileSystemContentResolver.prototype.getPartType = function (filePath) {
        var ext = path_1.default.extname(filePath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext))
            return 'image';
        if (['.mp3', '.wav'].includes(ext))
            return 'audio';
        return 'text';
    };
    return FileSystemContentResolver;
}());
exports.FileSystemContentResolver = FileSystemContentResolver;

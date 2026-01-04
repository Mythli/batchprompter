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
exports.FileSystemArtifactHandler = void 0;
var path_1 = require("path");
var promises_1 = require("fs/promises");
var FileSystemArtifactHandler = /** @class */ (function () {
    function FileSystemArtifactHandler(events, baseDir) {
        this.events = events;
        this.baseDir = baseDir;
        this.events.on('plugin:artifact', this.handleArtifact.bind(this));
    }
    FileSystemArtifactHandler.prototype.handleArtifact = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var rowStr, stepStr, stepDir, fullPath, content, base64Data, res, arr, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        rowStr = String(payload.row).padStart(3, '0');
                        stepStr = String(payload.step).padStart(2, '0');
                        stepDir = path_1.default.join(this.baseDir, "".concat(rowStr, "_").concat(stepStr));
                        // Heuristic: If filename starts with 'out/' or is absolute, treat as explicit output path
                        // Otherwise, treat as temporary artifact inside stepDir
                        if (path_1.default.isAbsolute(payload.filename) || payload.filename.startsWith('out/') || payload.filename.startsWith('out\\')) {
                            fullPath = path_1.default.resolve(payload.filename);
                        }
                        else {
                            fullPath = path_1.default.join(stepDir, payload.filename);
                        }
                        return [4 /*yield*/, this.ensureDir(fullPath)];
                    case 1:
                        _a.sent();
                        content = payload.content;
                        if (!(typeof content === 'string')) return [3 /*break*/, 7];
                        if (!content.startsWith('data:image')) return [3 /*break*/, 2];
                        try {
                            base64Data = content.replace(/^data:image\/\w+;base64,/, "");
                            content = Buffer.from(base64Data, 'base64');
                        }
                        catch (e) {
                            // Keep as string if conversion fails
                        }
                        return [3 /*break*/, 7];
                    case 2:
                        if (!content.startsWith('http')) return [3 /*break*/, 7];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 6, , 7]);
                        return [4 /*yield*/, fetch(content)];
                    case 4:
                        res = _a.sent();
                        return [4 /*yield*/, res.arrayBuffer()];
                    case 5:
                        arr = _a.sent();
                        content = Buffer.from(arr);
                        return [3 /*break*/, 7];
                    case 6:
                        e_1 = _a.sent();
                        return [3 /*break*/, 7];
                    case 7: return [4 /*yield*/, promises_1.default.writeFile(fullPath, content)];
                    case 8:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    FileSystemArtifactHandler.prototype.ensureDir = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var dir;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dir = path_1.default.dirname(filePath);
                        return [4 /*yield*/, promises_1.default.mkdir(dir, { recursive: true })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return FileSystemArtifactHandler;
}());
exports.FileSystemArtifactHandler = FileSystemArtifactHandler;

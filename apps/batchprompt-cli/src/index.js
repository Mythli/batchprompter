#!/usr/bin/env node
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var commander_1 = require("commander");
require("dotenv/config");
var zod_1 = require("zod");
var fs_1 = require("fs");
var path_1 = require("path");
var json2csv_1 = require("json2csv");
var batchprompt_1 = require("batchprompt");
var FileSystemArtifactHandler_js_1 = require("./handlers/FileSystemArtifactHandler.js");
var FileSystemContentResolver_js_1 = require("./io/FileSystemContentResolver.js");
var program = new commander_1.Command();
program
    .name('batchprompt')
    .description('Generate images and text from CSV or JSON data using AI');
var generateCmd = program.command('generate')
    .description('Generate content (text and/or images) from data piped via stdin')
    .argument('[template-files...]', 'Path to the prompt template files (text, image, audio, or directory)');
// Create a registry for CLI configuration purposes only
// At this point we don't know actual capabilities, so we assume all are available
// Actual validation happens during normalize() when real capabilities are known
var cliCapabilities = {
    hasSerper: true, // Assume available for CLI registration
    hasPuppeteer: true
};
var cliRegistry = (0, batchprompt_1.createDefaultRegistry)(cliCapabilities);
// Register all step arguments
batchprompt_1.StepRegistry.registerStepArgs(generateCmd, cliRegistry);
generateCmd.action(function (templateFilePaths, options) { return __awaiter(void 0, void 0, void 0, function () {
    var puppeteerHelperInstance, contentResolver, _a, actionRunner, puppeteerHelper, resolvedConfig, pluginRegistry, globalContext, fileConfig, fileAdapter, config, results_1, finalConfig, outDir, parser, csv, e_1;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 8, , 11]);
                contentResolver = new FileSystemContentResolver_js_1.FileSystemContentResolver();
                return [4 /*yield*/, (0, batchprompt_1.getConfig)({ contentResolver: contentResolver })];
            case 1:
                _a = _d.sent(), actionRunner = _a.actionRunner, puppeteerHelper = _a.puppeteerHelper, resolvedConfig = _a.config, pluginRegistry = _a.pluginRegistry, globalContext = _a.globalContext;
                puppeteerHelperInstance = puppeteerHelper;
                fileConfig = {};
                if (!options.config) return [3 /*break*/, 3];
                fileAdapter = new batchprompt_1.FileAdapter();
                return [4 /*yield*/, fileAdapter.load(options.config)];
            case 2:
                fileConfig = _d.sent();
                _d.label = 3;
            case 3: return [4 /*yield*/, batchprompt_1.StepRegistry.parseConfig(fileConfig, options, templateFilePaths, pluginRegistry, contentResolver)];
            case 4:
                config = _d.sent();
                // Initialize Artifact Handler
                // We use the tmpDir from the parsed runtime config
                new FileSystemArtifactHandler_js_1.FileSystemArtifactHandler(globalContext.events, config.tmpDir);
                // Initialize Debug Logger
                new batchprompt_1.DebugLogger(globalContext.events);
                results_1 = [];
                globalContext.events.on('row:end', function (_a) {
                    var result = _a.result;
                    results_1.push(result);
                });
                finalConfig = __assign(__assign({}, config), { concurrency: (_b = config.concurrency) !== null && _b !== void 0 ? _b : resolvedConfig.GPT_CONCURRENCY, taskConcurrency: (_c = config.taskConcurrency) !== null && _c !== void 0 ? _c : resolvedConfig.TASK_CONCURRENCY });
                // Run
                return [4 /*yield*/, actionRunner.run(finalConfig)];
            case 5:
                // Run
                _d.sent();
                // Write Data Output (CSV/JSON)
                if (config.dataOutputPath && results_1.length > 0) {
                    outDir = path_1.default.dirname(config.dataOutputPath);
                    if (!fs_1.default.existsSync(outDir)) {
                        fs_1.default.mkdirSync(outDir, { recursive: true });
                    }
                    if (config.dataOutputPath.endsWith('.json')) {
                        fs_1.default.writeFileSync(config.dataOutputPath, JSON.stringify(results_1, null, 2));
                    }
                    else {
                        parser = new json2csv_1.Parser({
                            transforms: [
                                json2csv_1.transforms.flatten({ objects: true, arrays: false, separator: '.' })
                            ]
                        });
                        csv = parser.parse(results_1);
                        fs_1.default.writeFileSync(config.dataOutputPath, csv);
                    }
                    console.log("\nData written to ".concat(config.dataOutputPath));
                }
                if (!puppeteerHelperInstance) return [3 /*break*/, 7];
                return [4 /*yield*/, puppeteerHelperInstance.close()];
            case 6:
                _d.sent();
                _d.label = 7;
            case 7:
                process.exit(0);
                return [3 /*break*/, 11];
            case 8:
                e_1 = _d.sent();
                console.error(e_1);
                if (!puppeteerHelperInstance) return [3 /*break*/, 10];
                return [4 /*yield*/, puppeteerHelperInstance.close()];
            case 9:
                _d.sent();
                _d.label = 10;
            case 10:
                process.exit(1);
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); });
program.command('schema')
    .description('Print the JSON Schema for the configuration file')
    .action(function () {
    var jsonSchema = zod_1.z.toJSONSchema(batchprompt_1.PipelineConfigSchema, {
        unrepresentable: 'any'
    });
    console.log(JSON.stringify(jsonSchema, null, 2));
    process.exit(0);
});
program.parse();

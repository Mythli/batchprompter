"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = exports.initConfig = exports.configSchema = void 0;
const dotenv = __importStar(require("dotenv"));
const zod_1 = require("zod");
const cache_manager_1 = require("cache-manager");
const sqlite_1 = __importDefault(require("@keyv/sqlite"));
const openai_1 = __importDefault(require("openai"));
const createCachedGptAsk_js_1 = require("./createCachedGptAsk.js");
const EventTracker_js_1 = require("./EventTracker.js");
const p_queue_1 = __importDefault(require("p-queue"));
dotenv.config();
// Helper to resolve environment variables with fallbacks
function getEnvVar(keys) {
    for (const key of keys) {
        const value = process.env[key];
        if (value)
            return value;
    }
    return undefined;
}
exports.configSchema = zod_1.z.object({
    AI_API_KEY: zod_1.z.string().min(1, "API Key is required. Checked: BATCHPROMPT_OPENAI_API_KEY, OPENAI_API_KEY, AI_API_KEY"),
    AI_API_URL: zod_1.z.string().url().default("https://api.openai.com/v1"),
    MODEL: zod_1.z.string().default("gpt-5.1"),
    GPT_MAX_CONVERSATION_CHARS: zod_1.z.coerce.number().int().positive().optional(),
    CACHE_ENABLED: zod_1.z.coerce.boolean().default(false),
    SQLITE_PATH: zod_1.z.string().default("cache.sqlite"),
});
const initConfig = async (overrides = {}) => {
    // Resolve values from multiple possible environment variable names
    const rawConfig = {
        ...process.env,
        AI_API_KEY: getEnvVar(['BATCHPROMPT_OPENAI_API_KEY', 'OPENAI_API_KEY', 'AI_API_KEY']),
        AI_API_URL: getEnvVar(['BATCHPROMPT_OPENAI_BASE_URL', 'OPENAI_BASE_URL', 'AI_API_URL']),
        MODEL: getEnvVar(['BATCHPROMPT_OPENAI_MODEL', 'OPENAI_MODEL', 'MODEL']),
    };
    const config = exports.configSchema.parse(rawConfig);
    // Setup Cache
    let cache;
    if (config.CACHE_ENABLED) {
        const sqliteStore = new sqlite_1.default(`sqlite://${config.SQLITE_PATH}`);
        cache = (0, cache_manager_1.createCache)({ stores: [sqliteStore] });
    }
    const eventTracker = new EventTracker_js_1.EventTracker();
    eventTracker.startPerformanceLogging('GPT-Runner');
    const openAi = new openai_1.default({
        baseURL: config.AI_API_URL,
        apiKey: config.AI_API_KEY,
    });
    // Default to 1 if not specified in overrides, to be safe, or 10 if strictly internal.
    // Based on request, CLI defaults to 1.
    const gptQueue = new p_queue_1.default({ concurrency: overrides.concurrency ?? 1 });
    const gptAskFns = (0, createCachedGptAsk_js_1.createCachedGptAsk)({
        openai: openAi,
        defaultModel: config.MODEL,
        cache: cache,
        eventTracker,
        maxConversationChars: config.GPT_MAX_CONVERSATION_CHARS,
        queue: gptQueue,
    });
    return {
        config,
        ask: gptAskFns.ask,
        isAskCached: gptAskFns.isAskCached,
        eventTracker
    };
};
exports.initConfig = initConfig;
let config = null;
const getConfig = async (overrides) => {
    if (!config) {
        config = await (0, exports.initConfig)(overrides);
    }
    return config;
};
exports.getConfig = getConfig;

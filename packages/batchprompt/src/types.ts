import OpenAI from 'openai';
import { Fetcher } from 'llm-fns';
import { PuppeteerHelper } from './utils/puppeteer/PuppeteerHelper.js';
import { ImageSearch } from './plugins/image-search/ImageSearch.js';
import { WebSearch } from './plugins/web-search/WebSearch.js';
import PQueue from 'p-queue';
import { Cache } from 'cache-manager';
import type { GlobalsConfig, ResolvedModelConfig, ServiceCapabilities, OutputConfig, StepConfig, ModelConfig, ResolvedPluginBase, RuntimeConfig } from './config/types.js';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';
import type { PluginRegistryV2 } from './plugins/types.js';
import { LlmClientFactory } from './LlmClientFactory.js';

export type { GlobalsConfig, ResolvedModelConfig, ServiceCapabilities, OutputConfig, StepConfig, ModelConfig, ResolvedPluginBase, RuntimeConfig };

export interface PipelineItem {
    row: Record<string, any>;
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    originalIndex: number;
    variationIndex?: number;
    stepHistory: Record<string, any>[];
    workspace: Record<string, any>;
}

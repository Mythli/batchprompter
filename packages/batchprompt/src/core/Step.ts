import OpenAI from 'openai';
import { StepConfig, GlobalContext, PipelineItem } from '../types.js';
import { StepRow } from './StepRow.js';
import { Plugin } from '../plugins/types.js';
import { ContentResolver } from './io/ContentResolver.js';

export class Step {
    public readonly plugins: { instance: Plugin; config: any }[] = [];
    private contentResolver: ContentResolver;

    constructor(
        public readonly config: StepConfig,
        public readonly globalContext: GlobalContext,
        public readonly stepIndex: number
    ) {
        this.contentResolver = globalContext.contentResolver;
    }

    async init() {
        // 1. Load Prompts (hydrate config)
        if (this.config.model) {
             if (this.config.model.prompt) {
                 this.config.model.prompt = await this.loadPrompt(this.config.model.prompt);
             }
             if (this.config.model.system) {
                 this.config.model.system = await this.loadPrompt(this.config.model.system);
             }
        }

        if (this.config.judge) {
            if (this.config.judge.prompt) {
                this.config.judge.prompt = await this.loadPrompt(this.config.judge.prompt);
            }
            if (this.config.judge.system) {
                this.config.judge.system = await this.loadPrompt(this.config.judge.system);
            }
        }

        if (this.config.feedback) {
            if (this.config.feedback.prompt) {
                this.config.feedback.prompt = await this.loadPrompt(this.config.feedback.prompt);
            }
            if (this.config.feedback.system) {
                this.config.feedback.system = await this.loadPrompt(this.config.feedback.system);
            }
        }

        // 2. Initialize Plugins
        for (const pluginConfig of this.config.plugins) {
            const plugin = this.globalContext.pluginRegistry.get(pluginConfig.type);
            if (plugin) {
                // We use the rawConfig which contains the merged model settings from resolveConfig
                const resolvedPluginConfig = await plugin.init(this, pluginConfig.rawConfig || pluginConfig);
                this.plugins.push({ instance: plugin, config: resolvedPluginConfig });
            }
        }
    }

    createRow(item: PipelineItem): StepRow {
        return new StepRow(this, item);
    }

    async loadPrompt(prompt: any): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
        if (!prompt) return [];
        if (Array.isArray(prompt)) return prompt; // Already loaded
        
        if (typeof prompt === 'string') {
            if (prompt.includes('{{')) {
                // Template: return as text to be rendered later
                return [{ type: 'text', text: prompt }];
            }

            // Try to resolve as file
            try {
                return await this.contentResolver.resolve(prompt);
            } catch (e) {
                // If resolve fails (e.g. not a file), treat as text
                return [{ type: 'text', text: prompt }];
            }
        }
        
        if (typeof prompt === 'object') {
             if (prompt.file) {
                 if (prompt.file.includes('{{')) {
                     return [{ type: 'text', text: prompt.file }];
                 }
                 return this.contentResolver.resolve(prompt.file);
             }
             if (prompt.text) return [{ type: 'text', text: prompt.text }];
             if (prompt.parts) return prompt.parts;
        }
        return [];
    }
}

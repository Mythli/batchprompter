import OpenAI from 'openai';
import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';
import { Plugin, PluginExecutionContext, PluginServices } from '../plugins/types.js';
import { ResolvedPluginBase } from '../config/types.js';

export interface ResolvedPlugin {
    instance: Plugin;
    config: any;
    def: ResolvedPluginBase;
}

export class PluginExecutor {
    constructor(
        private events: EventEmitter<BatchPromptEvents>,
        private pluginServices: PluginServices,
        private tempDir: string
    ) {}

    private createPluginContext(row: Record<string, any>, stepIndex: number, pluginIndex: number, index: number): PluginExecutionContext {
        return {
            row,
            stepIndex,
            pluginIndex,
            services: this.pluginServices,
            tempDirectory: this.tempDir,
            emit: (event, ...args) => {
                if (event === 'plugin:artifact') {
                    const payload = args[0];
                    if (payload && payload.filename && !path.isAbsolute(payload.filename) && !payload.filename.startsWith('out')) {
                        payload.filename = path.join(this.tempDir, payload.filename);
                    }
                    this.events.emit('plugin:artifact', payload);
                } else if (event === 'step:progress') {
                    const payload = args[0];
                    this.events.emit('step:progress', { row: index, step: stepIndex, ...payload });
                } else {
                    (this.events.emit as any)(event, ...args);
                }
            }
        };
    }

    async runPreparationPhase(
        baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        plugins: ResolvedPlugin[],
        row: Record<string, any>,
        index: number,
        stepIndex: number
    ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[][]> {
        let messageSets: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = [baseMessages];

        for (let i = 0; i < plugins.length; i++) {
            const { instance, config: pluginConfig } = plugins[i];
            if (instance.prepareMessages) {
                const context = this.createPluginContext(row, stepIndex, i, index);
                const nextMessageSets: OpenAI.Chat.Completions.ChatCompletionMessageParam[][] = [];
                
                for (const msgSet of messageSets) {
                    const result = await instance.prepareMessages(msgSet, pluginConfig, context);
                    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
                        // Explode
                        nextMessageSets.push(...(result as OpenAI.Chat.Completions.ChatCompletionMessageParam[][]));
                    } else {
                        nextMessageSets.push(result as OpenAI.Chat.Completions.ChatCompletionMessageParam[]);
                    }
                }
                messageSets = nextMessageSets;
            }
        }
        
        return messageSets;
    }
}

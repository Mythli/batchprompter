import OpenAI from 'openai';
import path from 'path';
import { EventEmitter } from 'eventemitter3';
import { BatchPromptEvents } from './events.js';
import { Plugin, PluginExecutionContext, PluginServices, PluginPacket } from '../plugins/types.js';
import { ResolvedPluginBase } from '../config/types.js';
import { PipelineItem } from '../types.js';
import { ResultProcessor } from './ResultProcessor.js';

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
        items: PipelineItem[],
        plugins: ResolvedPlugin[],
        stepIndex: number
    ): Promise<PipelineItem[]> {
        let currentItems = [...items];

        for (let i = 0; i < plugins.length; i++) {
            const { instance, config: pluginConfig, def } = plugins[i];
            
            if (!instance.prepareMessages) {
                continue;
            }

            const nextItems: PipelineItem[] = [];

            for (const item of currentItems) {
                const context = this.createPluginContext(item.row, stepIndex, i, item.originalIndex);
                
                // Construct messages for this item context
                // We combine history + accumulated content (User Prompt is not yet added)
                const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...item.history];
                if (item.accumulatedContent.length > 0) {
                    messages.push({ role: 'user', content: item.accumulatedContent });
                }

                // Execute Plugin
                const result = await instance.prepareMessages(messages, pluginConfig, context) as any;
                
                // Handle undefined/null result (Pass-through)
                if (result === undefined || result === null) {
                    nextItems.push(item);
                    continue;
                }

                // Normalize to PluginPacket[]
                let packets: PluginPacket[] = [];

                if (Array.isArray(result)) {
                    if (result.length === 0) {
                        // Empty array -> packets is []
                    } else if ('data' in result[0] && 'contentParts' in result[0]) {
                        // It's already PluginPacket[]
                        packets = result;
                    } else {
                        // Legacy or invalid format - warn and ignore to enforce new interface
                        console.warn(`[PluginExecutor] Plugin '${def.type}' returned invalid format. Expected PluginPacket[]. Ignoring result.`);
                    }
                } else if (typeof result === 'object' && result !== null) {
                    if ('contentParts' in result) {
                        // It's a single Packet { contentParts, data }
                        packets.push(result);
                    }
                }

                // Determine namespace (camelCase of plugin type)
                const namespace = def.type.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

                // Process Results (Merge/Explode)
                const processed = ResultProcessor.process(
                    [item],
                    packets,
                    def.output,
                    namespace
                );
                
                nextItems.push(...processed);
            }
            currentItems = nextItems;
        }
        
        return currentItems;
    }
}

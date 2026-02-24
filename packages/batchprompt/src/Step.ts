import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import { PipelineItem } from './types.js';
import { StepRow, StepRowState, StageDescriptor } from './StepRow.js';
import { StepConfig, GlobalConfig } from "./config/schema.js";
import { PluginRegistryV2, BasePlugin } from "./plugins/types.js";
import { BatchPromptEvents } from "./events.js";
import { aggressiveSanitize, ensureDir } from './utils/fileUtils.js';
import { renderSchemaObject } from './utils/schemaUtils.js';
import { ModelConfig } from './config/model.js';
import {EventEmitter} from "eventemitter3";

export interface StepPlugin {
    instance: BasePlugin;
    config: any;
}

export class Step {
    public readonly plugins: StepPlugin[];

    constructor(
        public readonly config: StepConfig,
        public readonly deps: {
            pluginRegistry: PluginRegistryV2,
            events: EventEmitter<BatchPromptEvents>,
            llmFactory: { create: (config: any, messages: any) => any }
        },
        public readonly stepIndex: number,
        public readonly globalConfig: GlobalConfig
    ) {
        // Normalize plugins once during initialization
        this.plugins = (config.plugins || []).map((pluginConfig: any) => {
            const instance = deps.pluginRegistry.createInstance(pluginConfig.type);
            if (!instance) {
                throw new Error(`Plugin '${pluginConfig.type}' not found in registry.`);
            }
            const normalizedConfig = instance.normalizeConfig(pluginConfig, config, globalConfig);
            return {
                instance,
                config: normalizedConfig
            };
        });
    }

    /**
     * Builds the ordered list of processing stages for a step.
     * 
     * The sequence is:
     *   plugin-prepare(0), plugin-prepare(1), ..., model, plugin-post(0), plugin-post(1), ...
     * 
     * This is used by Pipeline to process stages individually, allowing
     * explosion branches to be routed through the task queue.
     * 
     * @param hydratedConfig The hydrated step config (from createRow)
     */
    buildStages(hydratedConfig: StepConfig): StageDescriptor[] {
        const plugins = hydratedConfig.plugins || [];
        const stages: StageDescriptor[] = [];

        // Plugin prepare stages
        for (const plugin of plugins) {
            stages.push({
                type: 'plugin-prepare',
                instance: plugin.instance,
                config: plugin.config
            });
        }

        // Model stage (only if there are messages to send)
        const modelMessages = hydratedConfig.model?.messages;
        if (modelMessages && modelMessages.length > 0) {
            stages.push({ type: 'model' });
        }

        // Plugin post-process stages
        for (const plugin of plugins) {
            stages.push({
                type: 'plugin-post',
                instance: plugin.instance,
                config: plugin.config
            });
        }

        return stages;
    }

    private render(template: string, context: Record<string, any>): string {
        if (!template) return '';
        const t = Handlebars.compile(template, { noEscape: true });
        return t(context);
    }

    private async hydrate(context: Record<string, any>, originalIndex: number): Promise<StepConfig> {
        const { config, stepIndex, globalConfig } = this;
        const stepNum = stepIndex + 1;

        // 1. Sanitize context for file paths
        const sanitizedContext: Record<string, any> = {};
        for (const [key, val] of Object.entries(context)) {
            const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
            sanitizedContext[key] = aggressiveSanitize(stringVal);
        }

        // 2. Resolve Paths
        let outputDir = '';
        let outputBasename = `output_${originalIndex}_${stepNum}`;
        let outputExtension = config.aspectRatio ? '.png' : '.txt';
        let tempDir = '/tmp';

        if (config.output?.path) {
            const rendered = this.render(config.output.path, sanitizedContext);
            outputDir = path.resolve(path.dirname(rendered));
            await ensureDir(outputDir);

            const parsed = path.parse(rendered);
            outputBasename = parsed.name;
            outputExtension = parsed.ext;
        }

        if (config.output?.tmpDir) {
            const rendered = this.render(config.output.tmpDir, sanitizedContext);
            tempDir = path.resolve(rendered);
            await ensureDir(tempDir);
        }

        // 3. Resolve Schema
        let schema = config.schema;
        if (schema) {
            if (typeof schema === 'string') {
                try {
                    const template = Handlebars.compile(schema, { noEscape: true });
                    const renderedSchema = template(context);
                    schema = JSON.parse(renderedSchema);
                } catch (e) {
                    console.warn(`[Row ${originalIndex}] Failed to parse schema template:`, e);
                }
            } else {
                try {
                    schema = renderSchemaObject(schema, context);
                } catch (e: any) {
                    console.warn(`[Row ${originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }

        // 4. Hydrate Model Messages
        const hydrateModel = (m?: ModelConfig): ModelConfig | undefined => {
            if (!m) return undefined;
            return {
                ...m,
                messages: m.messages.map(msg => {
                    if (typeof msg.content === 'string') {
                        return { ...msg, content: this.render(msg.content, context) };
                    } else if (Array.isArray(msg.content)) {
                        const hydratedContent = msg.content.map(part => {
                            if (part.type === 'text') {
                                return { ...part, text: this.render(part.text, context) };
                            }
                            return part;
                        });
                        return { ...msg, content: hydratedContent };
                    }
                    return msg;
                }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
            };
        };

        // 5. Hydrate Plugins
        const hydratedPlugins = await Promise.all(this.plugins.map(async (p) => {
            const hydratedConfig = await p.instance.hydrate(config, globalConfig, p.config, context);
            return {
                ...p,
                config: hydratedConfig
            };
        }));

        return {
            ...config,
            resolvedOutputDir: outputDir,
            resolvedTempDir: tempDir,
            outputBasename,
            outputExtension,
            schema,
            model: hydrateModel(config.model)!,
            judge: hydrateModel(config.judge),
            feedback: hydrateModel(config.feedback),
            plugins: hydratedPlugins
        } as StepConfig;
    }

    async createRow(item: PipelineItem): Promise<StepRow> {
        const context = { ...item.workspace, ...item.row };
        const hydratedConfig = await this.hydrate(context, item.originalIndex);

        // Bake model messages into initial history
        const initialHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            ...item.history,
            ...(hydratedConfig.model?.messages || [])
        ];

        return new StepRow(this, hydratedConfig, {
            data: item.row,
            context: context,
            history: initialHistory,
            content: [],
            originalIndex: item.originalIndex,
            variationIndex: item.variationIndex,
            stepHistory: item.stepHistory
        });
    }
}

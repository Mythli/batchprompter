import OpenAI from 'openai';
import Handlebars from 'handlebars';
import path from 'path';
import fsPromises from 'fs/promises';
import { PipelineItem } from './types.js';
import { StepRow, StepRowState, StageDescriptor } from './StepRow.js';
import { StepConfig, GlobalConfig } from "./config/schema.js";
import { PluginRegistryV2, BasePlugin } from "./plugins/types.js";
import { BatchPromptEvents } from "./events.js";
import { aggressiveSanitize } from './utils/fileUtils.js';
import { renderSchemaObject } from './utils/schemaUtils.js';
import { ModelConfig } from './config/model.js';
import { EventEmitter } from "eventemitter3";

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

    buildStages(hydratedConfig: StepConfig): StageDescriptor[] {
        const plugins = hydratedConfig.plugins || [];
        const stages: StageDescriptor[] = [];

        for (const plugin of plugins) {
            stages.push({
                type: 'plugin-prepare',
                instance: plugin.instance,
                config: plugin.config
            });
        }

        const modelMessages = hydratedConfig.model?.messages;
        if (modelMessages && modelMessages.length > 0) {
            stages.push({ type: 'model' });
        }

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

    private async hydrate(context: Record<string, any>, originalIndex: number, lineage: number[]): Promise<StepConfig> {
        const { config, stepIndex, globalConfig } = this;
        const stepNum = stepIndex + 1;

        const sanitizedContext: Record<string, any> = {};
        for (const [key, val] of Object.entries(context)) {
            const stringVal = typeof val === 'object' ? JSON.stringify(val) : String(val || '');
            sanitizedContext[key] = aggressiveSanitize(stringVal);
        }

        let outputDir = '';
        const lineagePart = lineage.length > 0 ? `_v${lineage.join('-')}` : '';
        let outputBasename = `output_${originalIndex}${lineagePart}_${stepNum}`;
        let outputExtension = config.aspectRatio ? '.png' : '.txt';
        let tempDir = '/tmp';

        if (config.output?.path) {
            const rendered = this.render(config.output.path, sanitizedContext);
            outputDir = path.resolve(path.dirname(rendered));
            await fsPromises.mkdir(outputDir, { recursive: true });

            const parsed = path.parse(rendered);
            outputBasename = parsed.name;
            outputExtension = parsed.ext;
        }

        if (config.output?.tmpDir) {
            const rendered = this.render(config.output.tmpDir, sanitizedContext);
            tempDir = path.resolve(rendered);
            await fsPromises.mkdir(tempDir, { recursive: true });
        }

        let schema = config.schema;
        if (schema) {
            if (typeof schema === 'string') {
                try {
                    const template = Handlebars.compile(schema, { noEscape: true });
                    const renderedSchema = template(context);
                    schema = JSON.parse(renderedSchema);
                } catch (e) {
                    // console.warn(`[Row ${originalIndex}] Failed to parse schema template:`, e);
                }
            } else {
                try {
                    schema = renderSchemaObject(schema, context);
                } catch (e: any) {
                    // console.warn(`[Row ${originalIndex}] Failed to render schema templates:`, e);
                }
            }
        }

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
        const lineage = item.lineage || [];
        const hydratedConfig = await this.hydrate(context, item.originalIndex, lineage);

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
            lineage: lineage,
            stepHistory: item.stepHistory
        });
    }
}

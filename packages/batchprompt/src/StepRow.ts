import OpenAI from 'openai';
import path from 'path';
import fsPromises from 'fs/promises';
import { Step } from './Step.js';
import { PipelineItem } from './types.js';
import { BoundLlmClient } from './BoundLlmClient.js';
import { StandardStrategy } from './strategies/StandardStrategy.js';
import { CandidateStrategy } from './strategies/CandidateStrategy.js';
import { GenerationStrategy } from './strategies/GenerationStrategy.js';
import { PluginResult, PluginItem } from './plugins/types.js';
import { OutputConfig, StepConfig } from "./config/schema.js";
import { ModelConfig } from "./config/model.js";

/**
 * Describes a single processing stage within a step.
 */
export type StageDescriptor =
    | { type: 'plugin-prepare'; instance: any; config: any }
    | { type: 'model' }
    | { type: 'plugin-post'; instance: any; config: any };

function applyDataToTarget(
    target: Record<string, any>,
    data: any,
    options: {
        namespace?: string;
        column?: string;
        spreadObject?: boolean;
    } = {}
): void {
    const { namespace, column, spreadObject = false } = options;
    const isPlainObject = typeof data === 'object' && data !== null && !Array.isArray(data);

    if (column) {
        target[column] = data;
    } else if (namespace) {
        target[namespace] = data;
        if (spreadObject && isPlainObject) {
            Object.assign(target, data);
        }
    } else {
        if (isPlainObject) {
            Object.assign(target, data);
        }
    }
}

export interface StepRowState {
    data: Record<string, any>;
    context: Record<string, any>;
    history: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    content: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    originalIndex: number;
    lineage: number[];
    stepHistory: any[];
}

export class StepRow {
    constructor(
        public readonly step: Step,
        public readonly config: StepConfig,
        private readonly state: StepRowState
    ) {}

    get context() { return this.state.context; }
    get content() { return this.state.content; }
    get history() { return this.state.history; }

    getData(): Record<string, any> {
        return this.state.data;
    }

    getEvents() {
        return this.step.deps.events;
    }

    public getOriginalIndex(): number {
        return this.state.originalIndex;
    }

    async getPlugins() {
        return this.config.plugins || [];
    }

    async getTempDir() {
        const baseTmp = (this.config as any).resolvedTempDir || '/tmp';
        const lineagePart = this.state.lineage.length > 0 ? `_v${this.state.lineage.join('-')}` : '';
        
        // Hierarchical isolation: /baseTmp/row_0_v1-2/step_2/
        const dir = path.join(baseTmp, `row_${this.state.originalIndex}${lineagePart}`, `step_${this.step.stepIndex + 1}`);
        
        await fsPromises.mkdir(dir, { recursive: true });
        return dir;
    }

    async getOutputBasename() {
        return (this.config as any).outputBasename;
    }

    async getOutputExtension() {
        return (this.config as any).outputExtension;
    }

    async getResolvedOutputDir() {
        return (this.config as any).resolvedOutputDir;
    }

    async getResolvedSchema() {
        return this.config.schema;
    }

    async getPreparedMessages(): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
        if (this.state.content.length > 0) {
            return [...this.state.history, { role: 'user' as const, content: this.state.content }];
        }
        return [...this.state.history];
    }

    public async executeStage(stage: StageDescriptor): Promise<StepRow[]> {
        switch (stage.type) {
            case 'plugin-prepare': {
                const namespace = stage.instance.type;
                const pluginRow = stage.instance.createRow(this, stage.config);
                const result = await pluginRow.prepare();
                return this.applyResult(result, stage.config.output, namespace);
            }
            case 'model': {
                const result = await this.executeLlm();
                
                if (this.config.output?.path) {
                    const outDir = (this.config as any).resolvedOutputDir || '';
                    const baseName = (this.config as any).outputBasename || `output_${this.state.originalIndex}_${this.step.stepIndex + 1}`;
                    const ext = (this.config as any).outputExtension || '.txt';
                    
                    for (let i = 0; i < result.items.length; i++) {
                        const item = result.items[i];
                        let fileName = baseName + ext;
                        if (result.items.length > 1) {
                            fileName = `${baseName}_${i}${ext}`;
                        }
                        const fullPath = path.join(outDir, fileName);
                        
                        let content = item.data;
                        if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
                            content = JSON.stringify(content, null, 2);
                        }

                        this.getEvents().emit('artifact:emit', {
                            row: this.state.originalIndex,
                            step: this.step.stepIndex + 1,
                            source: 'core',
                            type: this.config.aspectRatio ? 'image' : (typeof item.data === 'object' ? 'json' : 'text'),
                            filename: fullPath,
                            content: content,
                            tags: ['final']
                        });
                    }
                }

                return this.applyResult(result, this.config.output);
            }
            case 'plugin-post': {
                const namespace = stage.instance.type;
                const pluginRow = stage.instance.createRow(this, stage.config);
                const result = await pluginRow.postProcess();
                return this.applyResult(result, stage.config.output, namespace);
            }
        }
    }

    async run(): Promise<PipelineItem[]> {
        let currentRows: StepRow[] = [this];
        const stages = this.step.buildStages(this.config);

        for (const stage of stages) {
            const nextRows: StepRow[] = [];
            for (const row of currentRows) {
                const results = await row.executeStage(stage);
                nextRows.push(...results);
            }
            currentRows = nextRows;
        }

        return currentRows.map(row => row.toPipelineItem());
    }

    public toPipelineItem(): PipelineItem {
        return {
            row: this.state.data,
            history: this.state.history,
            originalIndex: this.state.originalIndex,
            lineage: [...this.state.lineage],
            stepHistory: [...this.state.stepHistory],
            workspace: this.state.context
        };
    }

    public applyResult(result: PluginResult, outputConfig: OutputConfig, namespace?: string): StepRow[] {
        const { history, items } = result;

        if (items.length === 0) {
            return [];
        }

        if (outputConfig.explode && items.length > 1) {
            const total = items.length;
            const offset = outputConfig.offset ?? 0;
            const limit = outputConfig.limit;

            let itemsToExplode = items.slice(offset);
            if (limit !== undefined && limit > 0) {
                itemsToExplode = itemsToExplode.slice(0, limit);
            }

            const count = itemsToExplode.length;

            this.getEvents().emit('step:progress', {
                row: this.state.originalIndex,
                step: this.step.stepIndex + 1,
                type: 'explode',
                message: `Exploding ${count} items`,
                data: { total, count, limit, offset }
            });

            return itemsToExplode.map((item, idx) =>
                this.spawn(
                    item.data,
                    [...this.state.lineage, offset + idx],
                    outputConfig,
                    namespace,
                    history,
                    [...this.state.content, ...item.contentParts]
                )
            );
        }

        const combinedData = items.length === 1 ? items[0].data : items.map(i => i.data);
        const combinedContent = items.flatMap(i => i.contentParts);

        return [this.spawn(
            combinedData,
            this.state.lineage,
            outputConfig,
            namespace,
            history,
            [...this.state.content, ...combinedContent]
        )];
    }

    private spawn(
        data: any,
        lineage: number[],
        outputConfig: OutputConfig,
        namespace: string | undefined,
        history: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        content: OpenAI.Chat.Completions.ChatCompletionContentPart[]
    ): StepRow {
        const newData = JSON.parse(JSON.stringify(this.state.data));
        const newContext = { ...this.state.context };

        if (data != null) {
            if (namespace) {
                applyDataToTarget(newContext, data, { namespace, spreadObject: true });
            } else {
                applyDataToTarget(newContext, data, {});
            }

            if (outputConfig.mode === 'merge') {
                if (namespace) {
                    applyDataToTarget(newData, data, { namespace });
                } else {
                    applyDataToTarget(newData, data, {});
                }
            } else if (outputConfig.mode === 'column' && outputConfig.column) {
                applyDataToTarget(newData, data, { column: outputConfig.column });
                applyDataToTarget(newContext, data, { column: outputConfig.column });
            }
        }

        const newState: StepRowState = {
            data: newData,
            context: newContext,
            history: history,
            content: content,
            originalIndex: this.state.originalIndex,
            lineage: lineage,
            stepHistory: this.state.stepHistory
        };

        return new StepRow(this.step, this.config, newState);
    }

    public async executeLlm(): Promise<PluginResult> {
        const llm = await this.createLlm(this.config.model);

        let strategy: GenerationStrategy = new StandardStrategy(this);
        if (this.config.candidates > 1) {
            strategy = new CandidateStrategy(strategy as StandardStrategy, this);
        }

        const deterministicSalt = `row-${this.state.originalIndex}-step-${this.step.stepIndex}`;
        return await strategy.execute(deterministicSalt);
    }

    async createLlm(config?: ModelConfig): Promise<BoundLlmClient> {
        const targetConfig = config || this.config.model;
        if (!targetConfig) {
            throw new Error('No model configuration provided and no default model config available');
        }
        return this.step.deps.llmFactory.create(targetConfig, targetConfig.messages || []);
    }

    async getBoundClient(config: ModelConfig): Promise<BoundLlmClient> {
        return this.createLlm(config);
    }
}

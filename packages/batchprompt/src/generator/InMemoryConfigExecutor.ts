import { EventEmitter } from 'eventemitter3';
import { ActionRunner } from '../ActionRunner.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { BatchPromptEvents } from '../core/events.js';
import { MemoryArtifactHandler } from '../handlers/MemoryArtifactHandler.js';
import { ConfigExecutor } from './ConfigRefiner.js';
import { ConfigResolver } from '../config/ConfigResolver.js';
import { PromptLoader } from '../config/PromptLoader.js';
import { RuntimeConfig, StepConfig } from '../types.js';
import { ResolvedModelConfig } from '../config/types.js';

export class InMemoryConfigExecutor implements ConfigExecutor {
    constructor(
        private actionRunner: ActionRunner,
        private pluginRegistry: PluginRegistryV2,
        private events: EventEmitter<BatchPromptEvents>,
        private contentResolver: ContentResolver
    ) {}

    async runConfig(config: any, initialRows?: any[]): Promise<{ results: any[] }> {
        // Create dependencies for ConfigResolver
        const promptLoader = new PromptLoader(this.contentResolver);
        
        // Simple schema loader for memory context
        const schemaLoader = {
            load: async (source: string) => {
                try {
                    // Try to read from content resolver (if it's a path)
                    const content = await this.contentResolver.readText(source);
                    return JSON.parse(content);
                } catch {
                    // If read fails, assume it's raw JSON
                    return JSON.parse(source);
                }
            }
        };

        const resolver = new ConfigResolver({
            capabilities: { hasSerper: true, hasPuppeteer: true }, // Assume full capabilities for generation
            pluginRegistry: this.pluginRegistry,
            contentResolver: this.contentResolver,
            promptLoader: promptLoader,
            schemaLoader: schemaLoader
        });

        // Parse and validate the config
        const resolvedConfig = await resolver.resolve(config);

        // Inject initialRows if provided
        if (initialRows && initialRows.length > 0) {
            resolvedConfig.data.rows = initialRows;
        }
        
        // Convert ResolvedPipelineConfig to RuntimeConfig
        const runtimeConfig: RuntimeConfig = {
            concurrency: resolvedConfig.globals.concurrency,
            taskConcurrency: resolvedConfig.globals.taskConcurrency,
            tmpDir: resolvedConfig.globals.tmpDir,
            dataOutputPath: resolvedConfig.globals.dataOutputPath,
            data: resolvedConfig.data.rows,
            offset: resolvedConfig.data.offset,
            limit: resolvedConfig.data.limit,
            steps: resolvedConfig.steps.map((step, index) => {
                const modelConfig: ResolvedModelConfig = {
                    model: step.model,
                    temperature: step.temperature,
                    thinkingLevel: step.thinkingLevel,
                    systemParts: step.system.parts,
                    promptParts: step.prompt.parts
                };

                const plugins = step.plugins.map(p => ({
                    name: p.type,
                    config: p.rawConfig || {}, 
                    output: p.output
                }));

                const stepConfig: StepConfig = {
                    modelConfig,
                    tmpDir: step.tmpDir,
                    userPromptParts: step.prompt.parts,
                    outputPath: step.outputTemplate,
                    outputTemplate: step.outputTemplate,
                    output: step.output,
                    schemaPath: undefined,
                    jsonSchema: step.schema,
                    candidates: step.candidates,
                    judge: step.judge,
                    feedback: step.feedback,
                    feedbackLoops: step.feedback?.loops || 0,
                    aspectRatio: step.aspectRatio,
                    plugins,
                    preprocessors: [], // No preprocessors in resolved config yet
                    timeout: step.timeout,
                    handlers: step.handlers,
                    noCandidateCommand: false,
                    verifyCommand: step.verifyCommand,
                    postProcessCommand: step.command,
                    resolvedOutputDir: step.outputDir,
                    resolvedTempDir: step.tmpDir, // Use tmpDir as resolvedTempDir if not set
                    outputBasename: step.outputBasename,
                    outputExtension: step.outputExtension
                };
                return stepConfig;
            })
        };
        
        // Capture artifacts in memory (so we don't write to disk during test runs)
        const memoryHandler = new MemoryArtifactHandler(this.events);
        
        // Capture results
        const results: any[] = [];
        const resultHandler = ({ result }: any) => results.push(result);
        this.events.on('row:end', resultHandler);

        try {
            await this.actionRunner.run(runtimeConfig);
        } finally {
            this.events.off('row:end', resultHandler);
            // We don't need to explicitly clear memoryHandler as it's garbage collected,
            // but we should ensure it stops listening if it hasn't already.
            // Note: MemoryArtifactHandler binds to events in constructor. 
            // Ideally, it should have a dispose method. For now, we rely on it being short-lived.
        }

        return { results };
    }
}

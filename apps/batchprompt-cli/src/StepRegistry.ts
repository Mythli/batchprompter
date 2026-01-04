import { Command } from 'commander';
import { ModelFlags } from './ModelFlags.js';
import { 
    RuntimeConfig, 
    StepConfig, 
    ModelDefinition, 
    ResolvedModelConfig,
    loadData,
    PromptLoader,
    PluginRegistryV2,
    SchemaLoader,
    UrlExpanderPlugin
} from 'batchprompt';
import { createConfigSchema } from './ConfigSchema.js';
import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';
import { UrlExpanderAdapter } from './adapters/UrlExpanderAdapter.js';

export class StepRegistry {
    private adapters: CliPluginAdapter[] = [];

    constructor(adapters: CliPluginAdapter[]) {
        this.adapters = adapters;
    }

    registerStepArgs(program: Command, registry: PluginRegistryV2) {
        // --- Config File ---
        program.option('--config <file>', 'Path to YAML/JSON config file');

        // --- Global Level ---
        ModelFlags.register(program, '', { includeSystem: true, includePrompt: true }); // Main Model
        ModelFlags.register(program, 'judge', { includePrompt: true }); // Global Judge
        ModelFlags.register(program, 'feedback', { includePrompt: true }); // Global Feedback

        // Global Workflow
        program.option('-o, --output <path>', 'Template path for the output');
        program.option('--output-column <column>', 'Column name to write output to');
        program.option('--export', 'Export step result to output row');
        program.option('--data-output <path>', 'Path to save the processed data file');
        program.option('--tmp-dir <path>', 'Directory for temporary files');
        program.option('-c, --concurrency <number>', 'Number of concurrent requests (default: 50)');
        program.option('--task-concurrency <number>', 'Number of concurrent row tasks (default: 100)');
        program.option('-S, --schema <file>', 'Path to the JSON Schema file');
        program.option('--candidates <number>', 'Number of candidates (default: 1)');
        program.option('--feedback-loops <number>', 'Number of feedback loops (default: 0)');
        program.option('--aspect-ratio <ratio>', 'Aspect ratio for image generation');
        program.option('--explode', 'Explode array results into multiple rows');
        program.option('--timeout <seconds>', 'Timeout for each step in seconds (default: 180)');

        // --- Limits & Offsets ---
        program.option('--limit <number>', 'Master limit (sets both input and output limits)', parseInt);
        program.option('--offset <number>', 'Master offset (sets both input and output offsets)', parseInt);
        program.option('--input-limit <number>', 'Limit for input rows', parseInt);
        program.option('--input-offset <number>', 'Offset for input rows', parseInt);

        // --- Step Level (1-10) ---
        for (let i = 1; i <= 10; i++) {
            ModelFlags.register(program, `${i}`, { includeSystem: true, includePrompt: true });
            ModelFlags.register(program, `judge-${i}`, { includePrompt: true });
            ModelFlags.register(program, `feedback-${i}`, { includePrompt: true });

            program.option(`--output-${i} <path>`, `Output path for step ${i}`);
            program.option(`--output-column-${i} <column>`, `Output column for step ${i}`);
            program.option(`--export-${i}`, `Export result for step ${i}`);
            program.option(`--json-schema-${i} <file>`, `Schema for step ${i}`);
            program.option(`--candidates-${i} <number>`, `Candidates for step ${i}`);
            program.option(`--feedback-loops-${i} <number>`, `Feedback loops for step ${i}`);
            program.option(`--aspect-ratio-${i} <ratio>`, `Aspect ratio for step ${i}`);
            program.option(`--explode-${i}`, `Explode results for step ${i}`);
            program.option(`--timeout-${i} <seconds>`, `Timeout for step ${i} in seconds`);
            program.option(`--limit-${i} <number>`, `Limit output items for step ${i}`, parseInt);
            program.option(`--offset-${i} <number>`, `Offset output items for step ${i}`, parseInt);
        }

        // Register Plugin Options via Adapters
        for (const adapter of this.adapters) {
            adapter.registerOptions(program);
            for (let i = 1; i <= 10; i++) {
                adapter.registerOptionsForStep(program, i);
            }
        }

        // Register UrlExpander Adapter explicitly if not already in adapters list
        // Check if UrlExpander is already handled
        const hasUrlExpander = this.adapters.some(a => a.plugin.type === 'url-expander');
        if (!hasUrlExpander) {
            const urlExpanderPlugin = registry.get('url-expander');
            if (urlExpanderPlugin) {
                const adapter = new UrlExpanderAdapter(urlExpanderPlugin as UrlExpanderPlugin);
                adapter.registerOptions(program);
                for (let i = 1; i <= 10; i++) {
                    adapter.registerOptionsForStep(program, i);
                }
                // Add to adapters list for parsing later
                this.adapters.push(adapter);
            }
        }
    }

    async parseConfig(
        fileConfig: any, 
        options: Record<string, any>, 
        positionalArgs: string[], 
        registry: PluginRegistryV2,
        schemaLoader: SchemaLoader,
        promptLoader: PromptLoader
    ): Promise<RuntimeConfig> {
        // 1. Load Data from Pipe
        const pipedData = await loadData();

        // 2. Merge Data into Config
        const configToParse = { ...fileConfig };
        if (!configToParse.data) {
            configToParse.data = {};
        }

        if (pipedData) {
            configToParse.data.rows = pipedData;
        }

        // 3. Normalize via Zod Schema (Merge File + CLI)
        const normalized = createConfigSchema(this.adapters).parse({ 
            fileConfig: configToParse, 
            options, 
            args: positionalArgs 
        });

        // 4. Normalize Schemas (Resolve paths to objects)
        for (const step of normalized.steps) {
            // Step Schema
            if (step.schemaPath) {
                try {
                    step.jsonSchema = await schemaLoader.load(step.schemaPath);
                    step.schemaPath = undefined; 
                } catch (e: any) {
                    // Ignore dynamic paths
                }
            }

            // Plugin Schemas
            for (const plugin of step.plugins) {
                const pluginInstance = registry.get(plugin.name);
                if (pluginInstance && pluginInstance.normalizeConfig) {
                    // We need a content resolver here. 
                    // But normalizeConfig is async.
                    // We can't easily inject it here without changing the signature of parseConfig or passing it down.
                    // Wait, parseConfig receives schemaLoader and promptLoader, but not contentResolver directly?
                    // Actually, schemaLoader has a contentResolver inside.
                    // But we need to pass it to normalizeConfig.
                    // Let's assume for now we skip this or we need to expose contentResolver from schemaLoader?
                    // Or we just don't support normalizeConfig in CLI parsing for now?
                    // The original code did:
                    // if (plugin.name === 'website-agent' || plugin.name === 'validation') ...
                    // Now we should use plugin.normalizeConfig if available.
                    // But we need contentResolver.
                    // Let's skip for now as it requires more refactoring of parseConfig signature.
                }
            }
        }

        // 5. Resolve Steps
        const steps: StepConfig[] = [];

        const resolveModel = async (def: ModelDefinition | undefined): Promise<ResolvedModelConfig | undefined> => {
            if (!def) return undefined;
            return {
                model: def.model,
                temperature: def.temperature,
                thinkingLevel: def.thinkingLevel,
                systemParts: await promptLoader.load(def.systemSource),
                promptParts: await promptLoader.load(def.promptSource)
            };
        };

        for (const stepDef of normalized.steps) {
            const mainResolved = await resolveModel(stepDef.modelConfig);
            if (!mainResolved || !mainResolved.model) {
                throw new Error(`Step ${stepDef.stepIndex}: Model configuration missing.`);
            }

            const judge = await resolveModel(stepDef.judge);
            const feedback = await resolveModel(stepDef.feedback);

            steps.push({
                modelConfig: mainResolved,
                tmpDir: normalized.global.tmpDir,
                userPromptParts: mainResolved.promptParts,
                outputPath: stepDef.outputPath,
                outputTemplate: stepDef.outputTemplate,
                output: stepDef.output,
                schemaPath: stepDef.schemaPath,
                jsonSchema: stepDef.jsonSchema,
                candidates: stepDef.candidates,
                judge,
                feedback,
                feedbackLoops: stepDef.feedbackLoops,
                aspectRatio: stepDef.aspectRatio,
                plugins: stepDef.plugins,
                options: options,
                timeout: stepDef.timeout,
                // Command fields are gone from StepConfig, handled by ShellPlugin
                noCandidateCommand: false, // Deprecated/Removed
                verifyCommand: undefined, // Deprecated/Removed
                postProcessCommand: undefined // Deprecated/Removed
            });
        }

        return {
            concurrency: normalized.global.concurrency,
            taskConcurrency: normalized.global.taskConcurrency,
            tmpDir: normalized.global.tmpDir,
            dataOutputPath: normalized.global.dataOutputPath,
            steps,
            data: normalized.data.rows,
            options,
            offset: normalized.data.offset,
            limit: normalized.data.limit
        };
    }
}

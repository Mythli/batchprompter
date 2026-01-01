import { Command } from 'commander';
import { ModelFlags } from './ModelFlags.js';
import { RuntimeConfig, StepConfig, ModelDefinition, ResolvedModelConfig, PreprocessorConfigDefinition } from '../types.js';
import { loadData } from '../utils/dataLoader.js';
import { PromptResolver } from '../utils/PromptResolver.js';
import { createConfigSchema } from './ConfigSchema.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { createPreprocessorRegistry } from '../getConfig.js';
import { ContentResolver } from '../core/io/ContentResolver.js';
import { ConfigNormalizer } from '../config/ConfigNormalizer.js';

export class StepRegistry {

    static registerStepArgs(program: Command, registry: PluginRegistryV2) {
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
        program.option('--verify-command <cmd>', 'Shell command to verify output');
        program.option('--command <cmd>', 'Shell command to run after generation');
        program.option('--candidates <number>', 'Number of candidates (default: 1)');
        program.option('--skip-candidate-command', 'Skip commands for candidates');
        program.option('--feedback-loops <number>', 'Number of feedback loops (default: 0)');
        program.option('--aspect-ratio <ratio>', 'Aspect ratio for image generation');
        program.option('--explode', 'Explode array results into multiple rows');
        program.option('--timeout <seconds>', 'Timeout for each step in seconds (default: 180)');

        // --- Limits & Offsets (Hierarchy) ---
        program.option('--limit <number>', 'Master limit for input rows and explode steps', parseInt);
        program.option('--offset <number>', 'Master offset for input rows and explode steps', parseInt);
        program.option('--input-limit <number>', 'Limit for input rows', parseInt);
        program.option('--input-offset <number>', 'Offset for input rows', parseInt);
        program.option('--explode-limit <number>', 'Default limit for explode steps', parseInt);
        program.option('--explode-offset <number>', 'Default offset for explode steps', parseInt);

        // --- Step Level (1-10) ---
        for (let i = 1; i <= 10; i++) {
            ModelFlags.register(program, `${i}`, { includeSystem: true, includePrompt: true });
            ModelFlags.register(program, `judge-${i}`, { includePrompt: true });
            ModelFlags.register(program, `feedback-${i}`, { includePrompt: true });

            program.option(`--output-${i} <path>`, `Output path for step ${i}`);
            program.option(`--output-column-${i} <column>`, `Output column for step ${i}`);
            program.option(`--export-${i}`, `Export result for step ${i}`);
            program.option(`--json-schema-${i} <file>`, `Schema for step ${i}`);
            program.option(`--verify-command-${i} <cmd>`, `Verify command for step ${i}`);
            program.option(`--command-${i} <cmd>`, `Post-process command for step ${i}`);
            program.option(`--candidates-${i} <number>`, `Candidates for step ${i}`);
            program.option(`--skip-candidate-command-${i}`, `Skip candidate commands for step ${i}`);
            program.option(`--feedback-loops-${i} <number>`, `Feedback loops for step ${i}`);
            program.option(`--aspect-ratio-${i} <ratio>`, `Aspect ratio for step ${i}`);
            program.option(`--explode-${i}`, `Explode results for step ${i}`);
            program.option(`--timeout-${i} <seconds>`, `Timeout for step ${i} in seconds`);
            program.option(`--limit-${i} <number>`, `Limit output items for step ${i}`, parseInt);
            program.option(`--offset-${i} <number>`, `Offset output items for step ${i}`, parseInt);
        }

        registry.registerCLI(program);
        const preprocessorRegistry = createPreprocessorRegistry();
        preprocessorRegistry.configureCLI(program);
    }

    static async parseConfig(
        fileConfig: any, 
        options: Record<string, any>, 
        positionalArgs: string[], 
        registry: PluginRegistryV2,
        contentResolver: ContentResolver
    ): Promise<RuntimeConfig> {
        // 1. Normalize via Zod Schema (Merge File + CLI)
        const normalized = createConfigSchema(registry).parse({ 
            fileConfig, 
            options, 
            args: positionalArgs 
        });

        // 2. Normalize Schemas (Resolve paths to objects)
        for (const step of normalized.steps) {
            // Step Schema
            if (step.schemaPath) {
                try {
                    const content = await contentResolver.readText(step.schemaPath);
                    step.jsonSchema = JSON.parse(content);
                    step.schemaPath = undefined; 
                } catch (e: any) {
                    // Ignore dynamic paths
                }
            }

            // Plugin Schemas
            for (const plugin of step.plugins) {
                if (plugin.name === 'website-agent' || plugin.name === 'validation') {
                    if (typeof plugin.config.schema === 'string') {
                        try {
                            const content = await contentResolver.readText(plugin.config.schema);
                            plugin.config.schema = JSON.parse(content);
                        } catch (e) {
                            // Ignore dynamic paths
                        }
                    }
                }
            }
        }

        // 3. Load Data
        const data = await loadData();

        // 4. Resolve Steps
        const steps: StepConfig[] = [];
        const promptResolver = new PromptResolver(contentResolver);

        const resolveModel = async (def: ModelDefinition | undefined): Promise<ResolvedModelConfig | undefined> => {
            if (!def) return undefined;
            return {
                model: def.model,
                temperature: def.temperature,
                thinkingLevel: def.thinkingLevel,
                systemParts: await promptResolver.resolve(def.systemSource),
                promptParts: await promptResolver.resolve(def.promptSource)
            };
        };

        for (const stepDef of normalized.steps) {
            const mainResolved = await resolveModel(stepDef.modelConfig);
            if (!mainResolved || !mainResolved.model) {
                throw new Error(`Step ${stepDef.stepIndex}: Model configuration missing.`);
            }

            const judge = await resolveModel(stepDef.judge);
            const feedback = await resolveModel(stepDef.feedback);

            const activePreprocessors: PreprocessorConfigDefinition[] = [];
            for (const ppDef of stepDef.preprocessors) {
                activePreprocessors.push({
                    name: ppDef.name,
                    config: ppDef.config
                });
            }

            steps.push({
                modelConfig: mainResolved,
                tmpDir: normalized.global.tmpDir,
                userPromptParts: mainResolved.promptParts,
                outputPath: stepDef.outputPath,
                outputTemplate: stepDef.outputTemplate,
                output: stepDef.output,
                schemaPath: stepDef.schemaPath,
                jsonSchema: stepDef.jsonSchema,
                verifyCommand: stepDef.verifyCommand,
                postProcessCommand: stepDef.postProcessCommand,
                candidates: stepDef.candidates,
                noCandidateCommand: stepDef.noCandidateCommand,
                judge,
                feedback,
                feedbackLoops: stepDef.feedbackLoops,
                aspectRatio: stepDef.aspectRatio,
                plugins: stepDef.plugins,
                preprocessors: activePreprocessors,
                options: options,
                timeout: stepDef.timeout
            });
        }

        return {
            concurrency: normalized.global.concurrency,
            taskConcurrency: normalized.global.taskConcurrency,
            tmpDir: normalized.global.tmpDir,
            dataOutputPath: normalized.global.dataOutputPath,
            steps,
            data,
            options,
            offset: normalized.data.offset,
            limit: normalized.data.limit
        };
    }
}

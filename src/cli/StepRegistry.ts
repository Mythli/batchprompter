import { Command } from 'commander';
import fsPromises from 'fs/promises';
import { ModelFlags } from './ModelFlags.js';
import { RuntimeConfig, StepConfig, ModelDefinition, ResolvedModelConfig } from '../types.js';
import { loadData } from '../utils/dataLoader.js';
import { PromptResolver } from '../utils/PromptResolver.js';
import { ConfigSchema } from './ConfigSchema.js';

export class StepRegistry {

    static registerStepArgs(program: Command) {
        // --- Global Level ---
        ModelFlags.register(program, '', { includeSystem: true, defaultModel: 'gpt-4o' }); // Main Model
        ModelFlags.register(program, 'judge', { includePrompt: true }); // Global Judge
        ModelFlags.register(program, 'feedback', { includePrompt: true }); // Global Feedback

        // Global Image Search Agents
        ModelFlags.register(program, 'image-query', { includePrompt: true });
        ModelFlags.register(program, 'image-select', { includePrompt: true });

        // Global Workflow
        program.option('-o, --output <path>', 'Template path for the output');
        program.option('--output-column <column>', 'Column name to write output to');
        program.option('--data-output <path>', 'Path to save the processed data file');
        program.option('--tmp-dir <path>', 'Directory for temporary files', '.tmp');
        program.option('-c, --concurrency <number>', 'Number of concurrent requests', '20');
        program.option('--task-concurrency <number>', 'Number of concurrent row tasks', '100');
        program.option('-S, --schema <file>', 'Path to the JSON Schema file');
        program.option('--verify-command <cmd>', 'Shell command to verify output');
        program.option('--command <cmd>', 'Shell command to run after generation');
        program.option('--candidates <number>', 'Number of candidates', '1');
        program.option('--skip-candidate-command', 'Skip commands for candidates');
        program.option('--feedback-loops <number>', 'Number of feedback loops', '0');
        program.option('--aspect-ratio <ratio>', 'Aspect ratio for image generation');

        // Global Image Search Params
        program.option('--image-search-query <text>', 'Raw search query');
        program.option('--image-search-limit <number>', 'Images per query', '12');
        program.option('--image-search-select <number>', 'Images to select', '1');
        program.option('--image-search-query-count <number>', 'Queries to generate', '3');
        program.option('--image-search-sprite-size <number>', 'Images per sprite', '4');

        // --- Step Level (1-10) ---
        for (let i = 1; i <= 10; i++) {
            ModelFlags.register(program, `${i}`, { includeSystem: true });
            ModelFlags.register(program, `judge-${i}`, { includePrompt: true });
            ModelFlags.register(program, `feedback-${i}`, { includePrompt: true });

            // Step Image Search Agents
            ModelFlags.register(program, `image-query-${i}`, { includePrompt: true });
            ModelFlags.register(program, `image-select-${i}`, { includePrompt: true });

            program.option(`--output-${i} <path>`, `Output path for step ${i}`);
            program.option(`--output-column-${i} <column>`, `Output column for step ${i}`);
            program.option(`--json-schema-${i} <file>`, `Schema for step ${i}`); // Commander camelCases to jsonSchema1
            program.option(`--verify-command-${i} <cmd>`, `Verify command for step ${i}`);
            program.option(`--command-${i} <cmd>`, `Post-process command for step ${i}`);
            program.option(`--candidates-${i} <number>`, `Candidates for step ${i}`);
            program.option(`--skip-candidate-command-${i}`, `Skip candidate commands for step ${i}`);
            program.option(`--feedback-loops-${i} <number>`, `Feedback loops for step ${i}`);
            program.option(`--aspect-ratio-${i} <ratio>`, `Aspect ratio for step ${i}`);

            program.option(`--image-search-query-${i} <text>`, `Search query for step ${i}`);
            program.option(`--image-search-limit-${i} <number>`, `Search limit for step ${i}`);
            program.option(`--image-search-select-${i} <number>`, `Select count for step ${i}`);
            program.option(`--image-search-query-count-${i} <number>`, `Query count for step ${i}`);
            program.option(`--image-search-sprite-size-${i} <number>`, `Sprite size for step ${i}`);
        }
    }

    static async parseConfig(options: Record<string, any>, positionalArgs: string[]): Promise<RuntimeConfig> {
        // 1. Normalize via Zod Schema
        const normalized = ConfigSchema.parse({ options, args: positionalArgs });

        // 2. Load Data
        const data = await loadData(normalized.dataFilePath);

        // 3. Resolve Steps (Async Content Loading)
        const steps: StepConfig[] = [];

        // Helper to resolve a ModelDefinition to ResolvedModelConfig
        const resolveModel = async (def: ModelDefinition | undefined): Promise<ResolvedModelConfig | undefined> => {
            if (!def) return undefined;
            return {
                model: def.model,
                temperature: def.temperature,
                thinkingLevel: def.thinkingLevel,
                systemParts: await PromptResolver.resolve(def.systemSource),
                promptParts: await PromptResolver.resolve(def.promptSource)
            };
        };

        for (const stepDef of normalized.steps) {
            // Main Model
            const mainResolved = await resolveModel(stepDef);
            if (!mainResolved || !mainResolved.model) {
                throw new Error(`Step ${stepDef.stepIndex}: Model configuration missing.`);
            }

            // Auxiliary
            const judge = await resolveModel(stepDef.judge);
            const feedback = await resolveModel(stepDef.feedback);
            const imageQuery = await resolveModel(stepDef.imageSearch?.queryConfig);
            const imageSelect = await resolveModel(stepDef.imageSearch?.selectConfig);

            // Schema Loading
            let jsonSchema: any = undefined;
            if (stepDef.schemaPath && !stepDef.schemaPath.includes('{{')) {
                const content = await fsPromises.readFile(stepDef.schemaPath, 'utf-8');
                jsonSchema = JSON.parse(content);
            }

            // Construct StepConfig
            steps.push({
                ...mainResolved,
                tmpDir: normalized.global.tmpDir,
                
                // The promptParts from mainResolved now contain the merged user prompt (flag + positional).
                // We map this to userPromptParts for the execution engine.
                userPromptParts: mainResolved.promptParts,
                
                outputPath: stepDef.outputPath,
                outputColumn: stepDef.outputColumn,
                outputTemplate: stepDef.outputTemplate,
                
                schemaPath: stepDef.schemaPath,
                jsonSchema,
                verifyCommand: stepDef.verifyCommand,
                postProcessCommand: stepDef.postProcessCommand,
                
                candidates: stepDef.candidates,
                noCandidateCommand: stepDef.noCandidateCommand,
                
                judge,
                feedback,
                feedbackLoops: stepDef.feedbackLoops,
                
                imageSearch: stepDef.imageSearch ? {
                    ...stepDef.imageSearch,
                    queryConfig: imageQuery,
                    selectConfig: imageSelect
                } : undefined,
                
                aspectRatio: stepDef.aspectRatio
            });
        }

        return {
            ...normalized.global,
            dataFilePath: normalized.dataFilePath,
            steps,
            data
        };
    }
}

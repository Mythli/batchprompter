import { Command } from 'commander';
import fsPromises from 'fs/promises';
import { ModelFlags } from './ModelFlags.js';
import { RuntimeConfig, StepConfig, ResolvedModelConfig, ModelConfig } from '../types.js';
import { loadData } from '../utils/dataLoader.js';
import { PromptResolver } from '../utils/PromptResolver.js';
import { resolvePromptInput } from '../utils/fileUtils.js';

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
        const dataFilePath = positionalArgs[0];
        const templateFilePaths = positionalArgs.slice(1);

        if (!dataFilePath) {
            throw new Error("Data file path is required.");
        }

        // Load Data
        const data = await loadData(dataFilePath);

        // Determine number of steps based on positional args or flags
        // If templateFilePaths has 2 items, we have at least 2 steps.
        // If flags for step 3 exist, we have 3 steps.
        let maxStep = templateFilePaths.length;
        for (let i = 1; i <= 10; i++) {
            // Check if any flag for step i is set
            if (Object.keys(options).some(k => k.endsWith(`${i}`) || k.endsWith(`${i}Model`))) {
                maxStep = Math.max(maxStep, i);
            }
        }
        if (maxStep === 0) maxStep = 1; // Default to at least 1 step

        const steps: StepConfig[] = [];

        // Helper to get option with fallback
        const getOpt = (key: string, stepIndex: number) => {
            // Step specific key (e.g. output-1 -> output1)
            const stepKey = `${key}${stepIndex}`;
            if (options[stepKey] !== undefined) return options[stepKey];
            // Global key
            return options[key];
        };

        // Helper to resolve Model Config
        const resolveModelConfig = async (
            namespace: string,
            fallbackNamespace: string | null
        ): Promise<ResolvedModelConfig | undefined> => {

            const specific = ModelFlags.extract(options, namespace);
            const fallback = fallbackNamespace !== null ? ModelFlags.extract(options, fallbackNamespace) : {};

            // Merge: Specific > Fallback
            const merged: ModelConfig = {
                model: specific.model || fallback.model || options.model || 'gpt-4o',
                temperature: specific.temperature ?? fallback.temperature,
                thinkingLevel: specific.thinkingLevel || fallback.thinkingLevel,
                systemSource: specific.systemSource || fallback.systemSource,
                promptSource: specific.promptSource || fallback.promptSource
            };

            // If no model specified for auxiliary (Judge/Feedback/Image) and no prompt, return undefined (not active)
            // But for Main, we always return config.
            const isAux = namespace.includes('judge') || namespace.includes('feedback') || namespace.includes('image');
            if (isAux && !merged.promptSource && !merged.model) {
                return undefined;
            }
            if (isAux && !merged.model) {
                // If prompt exists but no model, inherit main model?
                // Usually better to default to main model if not set.
                merged.model = options.model || 'gpt-4o';
            }

            return {
                model: merged.model,
                temperature: merged.temperature,
                thinkingLevel: merged.thinkingLevel,
                systemParts: await PromptResolver.resolve(merged.systemSource),
                promptParts: await PromptResolver.resolve(merged.promptSource)
            };
        };

        for (let i = 1; i <= maxStep; i++) {
            // 1. Main Model Config
            // Namespace for step 1 is "1", fallback is "" (Global)
            const mainConfig = await resolveModelConfig(`${i}`, '');
            if (!mainConfig) throw new Error(`Failed to resolve configuration for step ${i}`);

            // 2. Positional User Prompt
            // templateFilePaths is 0-indexed, so step 1 is at index 0
            const posArg = templateFilePaths[i - 1];
            let userPromptParts: any[] = [];
            if (posArg) {
                // Check if dynamic
                if (posArg.includes('{{')) {
                    // Store as text for runtime resolution
                    userPromptParts = [{ type: 'text', text: posArg }]; // Treat path as text to be rendered later
                } else {
                    userPromptParts = await resolvePromptInput(posArg);
                }
            }

            // 3. Auxiliary Models
            const judgeConfig = await resolveModelConfig(`judge-${i}`, 'judge');
            const feedbackConfig = await resolveModelConfig(`feedback-${i}`, 'feedback');
            
            // Image Search Agents
            const imageQueryConfig = await resolveModelConfig(`image-query-${i}`, 'image-query');
            const imageSelectConfig = await resolveModelConfig(`image-select-${i}`, 'image-select');

            // 4. Workflow & IO
            const candidates = parseInt(getOpt('candidates', i) || '1', 10);
            const feedbackLoops = parseInt(getOpt('feedbackLoops', i) || '0', 10);

            // Image Search
            const query = getOpt('imageSearchQuery', i);
            const imgSearch = {
                query,
                queryConfig: imageQueryConfig,
                selectConfig: imageSelectConfig,
                limit: parseInt(getOpt('imageSearchLimit', i) || '12', 10),
                select: parseInt(getOpt('imageSearchSelect', i) || '1', 10),
                queryCount: parseInt(getOpt('imageSearchQueryCount', i) || '3', 10),
                spriteSize: parseInt(getOpt('imageSearchSpriteSize', i) || '4', 10),
            };

            // Schema
            // Commander maps --json-schema-1 to jsonSchema1
            // Global is --schema -> schema
            const schemaPath = options[`jsonSchema${i}`] || options.schema;
            let jsonSchema: any = undefined;
            if (schemaPath) {
                // If static path, load it. If dynamic, wait.
                if (!schemaPath.includes('{{')) {
                    const content = await fsPromises.readFile(schemaPath, 'utf-8');
                    jsonSchema = JSON.parse(content);
                }
            }

            steps.push({
                ...mainConfig,
                tmpDir: options.tmpDir || '.tmp',
                userPromptParts,
                outputPath: getOpt('output', i),
                outputColumn: getOpt('outputColumn', i),
                outputTemplate: getOpt('output', i), // Store raw for dynamic
                schemaPath,
                jsonSchema,
                verifyCommand: getOpt('verifyCommand', i),
                postProcessCommand: getOpt('command', i), // --command -> postProcessCommand
                candidates,
                noCandidateCommand: options[`skipCandidateCommand${i}`] || options.skipCandidateCommand,
                judge: judgeConfig,
                feedback: feedbackConfig,
                feedbackLoops,
                imageSearch: (imgSearch.query || imgSearch.queryConfig) ? imgSearch : undefined,
                aspectRatio: getOpt('aspectRatio', i)
            });
        }

        return {
            concurrency: parseInt(options.concurrency || '20', 10),
            taskConcurrency: parseInt(options.taskConcurrency || '100', 10),
            tmpDir: options.tmpDir || '.tmp',
            dataFilePath,
            dataOutputPath: options.dataOutput,
            steps,
            data
        };
    }
}

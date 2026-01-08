import { Command } from 'commander';
import { ModelFlags } from './ModelFlags.js';
import { 
    RuntimeConfig, 
    loadData,
    PromptLoader,
    PluginRegistryV2,
    SchemaLoader,
    UrlExpanderPlugin,
    ContentResolver,
    ServiceCapabilities
} from 'batchprompt';
import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';
import { UrlExpanderAdapter } from './adapters/UrlExpanderAdapter.js';
import { ConfigLoader } from './ConfigLoader.js';

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
        // Only register adapters for plugins that are actually present in the registry
        const activePlugins = new Set(registry.getAll().map(p => p.type));
        
        for (const adapter of this.adapters) {
            if (activePlugins.has(adapter.plugin.type)) {
                adapter.registerOptions(program);
                for (let i = 1; i <= 10; i++) {
                    adapter.registerOptionsForStep(program, i);
                }
            }
        }
    }

    async parseConfig(
        configPath: string | undefined, 
        options: Record<string, any>, 
        positionalArgs: string[], 
        registry: PluginRegistryV2
    ): Promise<RuntimeConfig> {
        // 1. Load Data from Pipe
        const pipedData = await loadData();

        // 2. Use ConfigLoader to load and hydrate config
        const loader = new ConfigLoader(registry, this.adapters);
        const config = await loader.load(configPath, options, positionalArgs);

        // 3. Merge Data
        if (pipedData) {
            config.data = pipedData;
        }

        return config;
    }
}

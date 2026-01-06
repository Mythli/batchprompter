import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { 
    PluginRegistryV2, 
    SchemaBuilder, 
    ConfigExpander, 
    PromptLoader,
    RuntimeConfig
} from 'batchprompt';
import { CliConfigBuilder } from './CliConfigBuilder.js';
import { CliPluginAdapter } from './interfaces/CliPluginAdapter.js';
import { FileSystemContentResolver } from './io/FileSystemContentResolver.js';

export class ConfigLoader {
    constructor(
        private registry: PluginRegistryV2,
        private adapters: CliPluginAdapter[]
    ) {}

    async load(
        configPath: string | undefined, 
        options: Record<string, any>, 
        args: string[]
    ): Promise<RuntimeConfig> {
        // 1. Load File
        let fileConfig = {};
        if (configPath) {
            const content = fs.readFileSync(configPath, 'utf-8');
            fileConfig = JSON.parse(content); // Or YAML
        }

        // 2. Merge CLI Flags
        const rawConfig = CliConfigBuilder.build(fileConfig, options, args, this.adapters);

        // 3. Validate Input (Loose)
        const builder = new SchemaBuilder(this.registry);
        const inputSchema = builder.build('input');
        const userConfig = inputSchema.parse(rawConfig);

        // 4. Hydrate Static Files (Pre-normalization)
        // We iterate steps and load files if they are static strings
        for (const step of userConfig.steps) {
            // Schema
            if (typeof step.schema === 'string' && !step.schema.includes('{{')) {
                const schemaContent = fs.readFileSync(step.schema, 'utf-8');
                step.schema = JSON.parse(schemaContent);
            }

            // Prompt (Model)
            if (step.model && step.model.prompt) {
                step.model.prompt = await this.hydratePrompt(step.model.prompt);
            }
            if (step.model && step.model.system) {
                step.model.system = await this.hydratePrompt(step.model.system);
            }
            
            // Judge / Feedback
            if (step.judge && step.judge.prompt) {
                step.judge.prompt = await this.hydratePrompt(step.judge.prompt);
            }
             if (step.judge && step.judge.system) {
                step.judge.system = await this.hydratePrompt(step.judge.system);
            }
            
            if (step.feedback && step.feedback.prompt) {
                step.feedback.prompt = await this.hydratePrompt(step.feedback.prompt);
            }
            if (step.feedback && step.feedback.system) {
                step.feedback.system = await this.hydratePrompt(step.feedback.system);
            }
        }

        // 5. Expand Shortcuts
        const expandedConfig = ConfigExpander.expand(userConfig, this.registry);

        // 6. Validate Runtime (Strict)
        const runtimeSchema = builder.build('runtime');
        const parsedConfig = runtimeSchema.parse(expandedConfig);

        // Flatten globals into RuntimeConfig
        const runtimeConfig: RuntimeConfig = {
            ...parsedConfig,
            concurrency: parsedConfig.globals.concurrency,
            taskConcurrency: parsedConfig.globals.taskConcurrency,
            tmpDir: parsedConfig.globals.tmpDir,
            dataOutputPath: parsedConfig.globals.dataOutputPath,
            offset: parsedConfig.globals.offset,
            limit: parsedConfig.globals.limit,
            inputOffset: parsedConfig.globals.inputOffset,
            inputLimit: parsedConfig.globals.inputLimit,
        };

        return runtimeConfig;
    }

    private async hydratePrompt(prompt: any): Promise<any> {
        if (typeof prompt === 'string' && !prompt.includes('{{')) {
            // It's a static file path
            // Use a temporary PromptLoader with FS resolver to parse it
            const resolver = new FileSystemContentResolver();
            const loader = new PromptLoader(resolver);
            return await loader.load(prompt);
        }
        return prompt;
    }
}

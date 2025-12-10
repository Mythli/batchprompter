import { Command } from 'commander';
import Handlebars from 'handlebars';
import { ContentProviderPlugin, PluginContext, PluginResult, NormalizedPluginConfig } from '../types.js';
import { ServiceCapabilities } from '../../types.js';

interface DedupeConfig {
    keyTemplate: string;
}

export class DedupePlugin implements ContentProviderPlugin {
    name = 'dedupe';
    private seenKeys = new Set<string>();

    constructor() {}

    register(program: Command): void {
        program.option('--dedupe-key <template>', 'Handlebars template for the deduplication key');
    }

    registerStep(program: Command, stepIndex: number): void {
        program.option(`--dedupe-key-${stepIndex} <template>`, `Dedupe key for step ${stepIndex}`);
    }

    normalize(
        options: Record<string, any>, 
        stepIndex: number, 
        globalConfig: any,
        capabilities: ServiceCapabilities
    ): NormalizedPluginConfig | undefined {
        const getOpt = (key: string) => {
            const specific = options[`${key}${stepIndex}`];
            if (specific !== undefined) return specific;
            return options[key];
        };

        const keyTemplate = getOpt('dedupeKey');
        if (!keyTemplate) return undefined;

        return {
            config: { keyTemplate }
        };
    }

    async prepare(config: DedupeConfig, row: Record<string, any>): Promise<DedupeConfig> {
        return config;
    }

    async execute(context: PluginContext): Promise<PluginResult> {
        const { row, config } = context;
        const key = Handlebars.compile(config.keyTemplate, { noEscape: true })(row);
        
        if (this.seenKeys.has(key)) {
            console.log(`[Row ${row.index}] [Dedupe] ❌ Dropping duplicate key: "${key}"`);
            return { contentParts: [], data: [] };
        }
        
        console.log(`[Row ${row.index}] [Dedupe] ✅ Keeping new key: "${key}"`);
        this.seenKeys.add(key);
        return { contentParts: [], data: [{}] }; 
    }
}

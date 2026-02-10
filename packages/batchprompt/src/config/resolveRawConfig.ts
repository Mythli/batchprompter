import OpenAI from 'openai';
import { ContentResolver, PassthroughContentResolver } from './ContentResolver.js';
import { PluginRegistryV2 } from '../plugins/types.js';
import { createPipelineSchema, GlobalConfig } from './schema.js';

export interface ResolveConfigDeps {
    contentResolver?: ContentResolver;
    pluginRegistry: PluginRegistryV2;
}

/**
 * Resolves a raw config object into a validated GlobalConfig.
 * 
 * This function:
 * 1. Walks the config and resolves file paths for prompt/system/schema fields via ContentResolver
 * 2. Validates through createPipelineSchema()
 * 3. Returns typed GlobalConfig
 * 
 * No renaming. No restructuring. Just IO resolution + validation.
 */
export async function resolveRawConfig(
    rawConfig: Record<string, any>,
    deps: ResolveConfigDeps
): Promise<GlobalConfig> {
    const contentResolver = deps.contentResolver ?? new PassthroughContentResolver();
    const pluginRegistry = deps.pluginRegistry;

    // Deep clone to avoid mutating the original
    const config = JSON.parse(JSON.stringify(rawConfig));

    // 1. Resolve file paths in global model config
    if (config.model && typeof config.model === 'object') {
        await resolveModelFields(config.model, contentResolver);
    }

    // 2. Resolve file paths in global judge/feedback
    if (config.judge && typeof config.judge === 'object') {
        await resolveModelFields(config.judge, contentResolver);
    }
    if (config.feedback && typeof config.feedback === 'object') {
        await resolveModelFields(config.feedback, contentResolver);
    }

    // 3. Resolve file paths in global schema
    if (config.schema && typeof config.schema === 'string') {
        config.schema = await resolveSchemaField(config.schema, contentResolver);
    }

    // 4. Walk steps
    if (Array.isArray(config.steps)) {
        for (const step of config.steps) {
            // Resolve step model
            if (step.model && typeof step.model === 'object') {
                await resolveModelFields(step.model, contentResolver);
            }

            // Resolve step judge/feedback
            if (step.judge && typeof step.judge === 'object') {
                await resolveModelFields(step.judge, contentResolver);
            }
            if (step.feedback && typeof step.feedback === 'object') {
                await resolveModelFields(step.feedback, contentResolver);
            }

            // Resolve step schema
            if (step.schema && typeof step.schema === 'string') {
                step.schema = await resolveSchemaField(step.schema, contentResolver);
            }

            // Walk plugins
            if (Array.isArray(step.plugins)) {
                for (const plugin of step.plugins) {
                    await resolvePluginFields(plugin, contentResolver);
                }
            }
        }
    }

    // 5. Validate through Zod schema
    const schema = createPipelineSchema(pluginRegistry);
    const validated = await schema.parseAsync(config);

    return validated as GlobalConfig;
}

/**
 * Resolves prompt and system fields in a model-like config object.
 * If the value is a string, tries to resolve it via ContentResolver.
 */
async function resolveModelFields(
    modelConfig: Record<string, any>,
    contentResolver: ContentResolver
): Promise<void> {
    if (modelConfig.prompt && typeof modelConfig.prompt === 'string') {
        const parts = await contentResolver.resolve(modelConfig.prompt);
        // If resolved to a single text part with the same content, keep as string
        if (parts.length === 1 && parts[0].type === 'text' && (parts[0] as any).text === modelConfig.prompt) {
            // Keep as-is (raw text)
        } else if (parts.length === 1 && parts[0].type === 'text') {
            // File with text content — use the text
            modelConfig.prompt = (parts[0] as any).text;
        } else {
            // Multiple parts (directory, mixed content) — use parts array
            modelConfig.prompt = parts;
        }
    }

    if (modelConfig.system && typeof modelConfig.system === 'string') {
        const parts = await contentResolver.resolve(modelConfig.system);
        if (parts.length === 1 && parts[0].type === 'text' && (parts[0] as any).text === modelConfig.system) {
            // Keep as-is
        } else if (parts.length === 1 && parts[0].type === 'text') {
            modelConfig.system = (parts[0] as any).text;
        } else {
            modelConfig.system = parts;
        }
    }
}

/**
 * Resolves a schema field that may be a file path to a JSON schema.
 * Returns the parsed JSON object, or tries to parse the string as JSON directly.
 */
async function resolveSchemaField(
    schemaValue: string,
    contentResolver: ContentResolver
): Promise<any> {
    try {
        // Try reading as file
        const content = await contentResolver.readText(schemaValue);
        // If readText returned something different from input, it was a file
        if (content !== schemaValue) {
            return JSON.parse(content);
        }
    } catch (e) {
        // Not a file or read failed
    }

    // Try parsing as inline JSON
    try {
        return JSON.parse(schemaValue);
    } catch (e) {
        // Not JSON either — return as-is (will likely fail schema validation)
        return schemaValue;
    }
}

/**
 * Walks a plugin config and resolves model-like fields and schema fields.
 * Looks for any property that is an object containing prompt/system keys,
 * or any property named 'schema' that is a string.
 */
async function resolvePluginFields(
    pluginConfig: Record<string, any>,
    contentResolver: ContentResolver
): Promise<void> {
    for (const [key, value] of Object.entries(pluginConfig)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Check if this looks like a model config (has prompt or system)
            if ('prompt' in value || 'system' in value) {
                await resolveModelFields(value, contentResolver);
            }
        }

        // Resolve schema fields
        if (key === 'schema' && typeof value === 'string') {
            pluginConfig[key] = await resolveSchemaField(value, contentResolver);
        }
    }
}

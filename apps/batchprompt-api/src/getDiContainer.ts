import { getDiContainer as getCoreDiContainer, MemoryContentResolver } from 'batchprompt';
import { ExecutionService } from './services/ExecutionService.js';
import { GenerationService } from './services/GenerationService.js';
import { ConfigRefiner } from './services/ConfigRefiner.js';

export type ApiConfig = Awaited<ReturnType<typeof initApiContainer>>;

async function initApiContainer(env: Record<string, any>) {
    // Use MemoryContentResolver for API execution
    const contentResolver = new MemoryContentResolver();

    // Initialize core batchprompt container
    const core = await getCoreDiContainer(env, { contentResolver });

    // Initialize API Services
    const executionService = new ExecutionService(
        core.actionRunner,
        core.pluginRegistry,
        core.globalContext,
        contentResolver
    );

    const configRefiner = new ConfigRefiner(
        core.llmFactory,
        executionService,
        { maxRetries: 3 }
    );

    const generationService = new GenerationService(
        core.llmFactory,
        configRefiner
    );

    return {
        ...core,
        executionService,
        generationService,
        configRefiner,
        contentResolver
    };
}

let instance: ApiConfig | null = null;

/**
 * Returns the API Dependency Injection container.
 * This is a singleton that wraps the core batchprompt container.
 */
export const getDiContainer = async (env: Record<string, any>) => {
    if (!instance) {
        instance = await initApiContainer(env);
    }
    return instance;
};

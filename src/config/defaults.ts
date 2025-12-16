import { GlobalsConfig, OutputConfig } from './types.js';

export const DEFAULT_MODEL = 'gpt-4o-mini';

export const DEFAULT_GLOBALS: Required<Omit<GlobalsConfig, 'model' | 'temperature' | 'thinkingLevel' | 'outputPath'>> = {
    concurrency: 50,
    taskConcurrency: 100,
    tmpDir: '.tmp'
};

export const DEFAULT_OUTPUT: Required<OutputConfig> = {
    mode: 'ignore',
    column: undefined as any,
    explode: false
};

export function applyGlobalsDefaults(globals?: Partial<GlobalsConfig>): GlobalsConfig & typeof DEFAULT_GLOBALS {
    return {
        ...DEFAULT_GLOBALS,
        ...globals
    };
}

export function mergeModelSettings(
    globals: { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
    step?: { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' },
    plugin?: { model?: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' }
): { model: string; temperature?: number; thinkingLevel?: 'low' | 'medium' | 'high' } {
    return {
        model: plugin?.model ?? step?.model ?? globals.model ?? DEFAULT_MODEL,
        temperature: plugin?.temperature ?? step?.temperature ?? globals.temperature,
        thinkingLevel: plugin?.thinkingLevel ?? step?.thinkingLevel ?? globals.thinkingLevel
    };
}

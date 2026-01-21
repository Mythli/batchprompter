// Barrel export for config module
export * from './schema.js';
export * from './model.js';
export * from './validationRules.js';

// Type aliases for backward compatibility
export type StepBaseConfig = import('./schema.js').StepConfig;
export type GlobalsConfig = import('./schema.js').GlobalConfig;

// Default output configuration constant
export const DEFAULT_PLUGIN_OUTPUT = {
    mode: 'ignore' as const,
    explode: false
};

/**
 * Resolves a model config by merging with step defaults.
 * If override is provided, it takes precedence.
 */
export function resolveModelConfig(
    override: import('./model.js').ModelConfig | undefined,
    stepDefault: import('./model.js').ModelConfig | undefined
): import('./model.js').ModelConfig | undefined {
    if (!override && !stepDefault) return undefined;
    if (!override) return stepDefault;
    if (!stepDefault) return override;
    return {
        ...stepDefault,
        ...override,
    };
}

// Barrel export for config module
export * from './schema.js';
export * from './model.js';
export * from './validationRules.js';
export * from './ContentResolver.js';
export * from './resolveRawConfig.js';

// Type aliases for backward compatibility
export type StepBaseConfig = import('./schema.js').StepConfig;
export type GlobalsConfig = import('./schema.js').GlobalConfig;

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

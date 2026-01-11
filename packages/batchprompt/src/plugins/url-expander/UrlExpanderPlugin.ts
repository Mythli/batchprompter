import { z } from 'zod';
import { BasePlugin, BasePluginRow } from '../types.js';
import { StepRow } from '../../StepRow.js';
import { UrlHandlerRegistry } from './utils/UrlHandlerRegistry.js';
import { UrlExpanderPluginRow } from './UrlExpanderPluginRow.js';
import {
    UrlExpanderConfig,
    UrlExpanderConfigSchema,
    UrlExpanderStepExtension
} from './UrlExpanderConfig.js';
import { StepConfig } from '../../config/index.js';

export class UrlExpanderPlugin extends BasePlugin<UrlExpanderConfig> {
    readonly type = 'url-expander';

    constructor(private registry: UrlHandlerRegistry) {
        super();
    }

    getSchema() {
        return UrlExpanderConfigSchema.transform(config => {
            return {
                ...config,
                id: config.id ?? `url-expander-${Date.now()}`,
            };
        });
    }

    getStepExtensionSchema() {
        return UrlExpanderStepExtension;
    }

    preprocessStep(step: any): any {
        if (step.expandUrls !== undefined && step.expandUrls !== false) {
            step.plugins = step.plugins || [];

            const isExplicitlyConfigured = step.plugins.some(
                (p: any) => p.type === 'url-expander'
            );

            if (!isExplicitlyConfigured) {
                let pluginConfig: any = {
                    type: 'url-expander',
                    output: { mode: 'ignore', explode: false },
                    mode: 'fetch',
                    maxChars: 30000
                };

                if (typeof step.expandUrls === 'object') {
                    pluginConfig = { ...pluginConfig, ...step.expandUrls };
                }

                step.plugins.unshift(pluginConfig);
            }
        }
        return step;
    }

    createRow(stepRow: StepRow, config: UrlExpanderConfig): BasePluginRow<UrlExpanderConfig> {
        return new UrlExpanderPluginRow(stepRow, config, this.registry);
    }
}

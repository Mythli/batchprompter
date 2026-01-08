import { StepConfig, GlobalContext, PipelineItem } from '../types.js';
import { StepRow } from './StepRow.js';
import { Plugin } from '../plugins/types.js';

export class Step {
    public readonly plugins: { instance: Plugin; config: any }[] = [];

    constructor(
        public readonly config: StepConfig,
        public readonly globalContext: GlobalContext,
        public readonly stepIndex: number
    ) {}

    async init() {
        // Initialize Plugins
        // The config.plugins array already contains fully resolved/merged configurations
        for (const pluginConfig of this.config.plugins) {
            const plugin = this.globalContext.pluginRegistry.get(pluginConfig.type);
            if (plugin) {
                // We pass the rawConfig which is now the fully merged config for that plugin
                const resolvedPluginConfig = await plugin.init(this, pluginConfig.rawConfig);
                this.plugins.push({ instance: plugin, config: resolvedPluginConfig });
            }
        }
    }

    createRow(item: PipelineItem): StepRow {
        return new StepRow(this, item);
    }
}

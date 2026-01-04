import { RuntimeConfig, GlobalContext } from './types.js';
import { PluginRegistryV2 } from './src/plugins/types.js';
import { PromptPreprocessorRegistry } from './src/preprocessors/PromptPreprocessorRegistry.js';
import { StepResolver } from './src/core/StepResolver.js';
import { MessageBuilder } from './src/core/MessageBuilder.js';
export declare class ActionRunner {
    private globalContext;
    private pluginRegistry;
    private preprocessorRegistry;
    private stepResolver;
    private messageBuilder;
    constructor(globalContext: GlobalContext, pluginRegistry: PluginRegistryV2, preprocessorRegistry: PromptPreprocessorRegistry, stepResolver: StepResolver, messageBuilder: MessageBuilder);
    run(config: RuntimeConfig): Promise<void>;
    private executePlugins;
    private executeModel;
    private processBatch;
}
//# sourceMappingURL=ActionRunner.d.ts.map
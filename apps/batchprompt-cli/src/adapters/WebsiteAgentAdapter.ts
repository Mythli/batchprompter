import { Command } from 'commander';
import { CliPluginAdapter } from '../interfaces/CliPluginAdapter.js';

export class WebsiteAgentAdapter implements CliPluginAdapter {
    readonly pluginType = 'websiteAgent';

    registerOptionsForStep(program: Command, stepIndex: number) {
        const s = stepIndex;
        program.option(`--${s}-website-agent-url <url>`, `URL for step ${s}`);
        program.option(`--${s}-website-agent-schema <path>`, `Schema for step ${s}`);
        program.option(`--${s}-website-agent-budget <number>`, `Budget for step ${s}`, parseInt);
        program.option(`--${s}-website-agent-batch-size <number>`, `Batch size for step ${s}`, parseInt);
        program.option(`--${s}-website-agent-navigator-model <model>`, `Navigator model for step ${s}`);
        program.option(`--${s}-website-agent-navigator-prompt <text>`, `Navigator prompt for step ${s}`);
        program.option(`--${s}-website-agent-extract-model <model>`, `Extract model for step ${s}`);
        program.option(`--${s}-website-agent-extract-prompt <text>`, `Extract prompt for step ${s}`);
        program.option(`--${s}-website-agent-merge-model <model>`, `Merge model for step ${s}`);
        program.option(`--${s}-website-agent-merge-prompt <text>`, `Merge prompt for step ${s}`);
        program.option(`--${s}-website-agent-output-mode <mode>`, `Output mode for step ${s}`);
        program.option(`--${s}-website-agent-output-column <column>`, `Output column for step ${s}`);
    }

    parseOptions(options: Record<string, any>, stepIndex: number): Record<string, any> | null {
        const getOpt = (key: string) => {
            const stepKey = `${stepIndex}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return options[stepKey];
        };

        const url = getOpt('websiteAgentUrl');
        if (!url) return null;

        const result: Record<string, any> = {
            type: 'websiteAgent',
            url,
        };

        const schema = getOpt('websiteAgentSchema');
        if (schema) result.schema = schema;

        const budget = getOpt('websiteAgentBudget');
        if (budget !== undefined) result.budget = budget;

        const batchSize = getOpt('websiteAgentBatchSize');
        if (batchSize !== undefined) result.batchSize = batchSize;

        // Navigator model
        const navModel = getOpt('websiteAgentNavigatorModel');
        const navPrompt = getOpt('websiteAgentNavigatorPrompt');
        if (navModel || navPrompt) {
            result.navigatorModel = {};
            if (navModel) result.navigatorModel.model = navModel;
            if (navPrompt) result.navigatorModel.prompt = navPrompt;
        }

        // Extract model
        const extModel = getOpt('websiteAgentExtractModel');
        const extPrompt = getOpt('websiteAgentExtractPrompt');
        if (extModel || extPrompt) {
            result.extractModel = {};
            if (extModel) result.extractModel.model = extModel;
            if (extPrompt) result.extractModel.prompt = extPrompt;
        }

        // Merge model
        const mrgModel = getOpt('websiteAgentMergeModel');
        const mrgPrompt = getOpt('websiteAgentMergePrompt');
        if (mrgModel || mrgPrompt) {
            result.mergeModel = {};
            if (mrgModel) result.mergeModel.model = mrgModel;
            if (mrgPrompt) result.mergeModel.prompt = mrgPrompt;
        }

        // Output
        const outputMode = getOpt('websiteAgentOutputMode');
        const outputColumn = getOpt('websiteAgentOutputColumn');
        if (outputMode || outputColumn) {
            result.output = {};
            if (outputMode) result.output.mode = outputMode;
            if (outputColumn) result.output.column = outputColumn;
        }

        return result;
    }
}

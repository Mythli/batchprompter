import { z } from 'zod';
import { IterativeRefiner, SafePipelineConfigSchema } from 'batchprompt';
import { CONFIG_DOCUMENTATION } from '../../generated/ConfigDocumentation.js';
const EvaluationSchema = z.object({
    success: z.boolean().describe("Whether the configuration output satisfies the user request."),
    feedback: z.string().optional().describe("If success is false, provide specific instructions on what to fix in the configuration."),
});
export class ConfigRefiner extends IterativeRefiner {
    llmFactory;
    executionService;
    constructor(llmFactory, executionService, options) {
        super(options);
        this.llmFactory = llmFactory;
        this.executionService = executionService;
    }
    async generate(input, history) {
        const generatorLlm = this.llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [
                { type: 'text', text: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.' },
                { type: 'text', text: 'Here is the documentation for the configuration format:\n\n' + CONFIG_DOCUMENTATION }
            ],
            promptParts: []
        });
        const messages = [];
        // 1. System Message
        const systemParts = generatorLlm.getSystemParts();
        if (systemParts.length > 0) {
            messages.push({ role: 'system', content: systemParts });
        }
        // 2. Initial User Message
        const initialUserContent = [
            { type: 'text', text: `Request: ${input.prompt}` }
        ];
        if (input.sampleRows && input.sampleRows.length > 0) {
            initialUserContent.push({
                type: 'text',
                text: `Sample Data (First ${input.sampleRows.length} unique rows from uploaded file): \n${JSON.stringify(input.sampleRows, null, 2)}\n\nIMPORTANT: Use this data ONLY to infer the input schema (e.g. column names). DO NOT embed these specific rows into the configuration. The configuration should be generic and ready to accept a file input matching this structure.`
            });
        }
        if (input.partialConfig) {
            initialUserContent.push({
                type: 'text',
                text: `Base Configuration (Partial): \n${JSON.stringify(input.partialConfig, null, 2)}\nPlease merge this into the final result.`
            });
        }
        messages.push({ role: 'user', content: initialUserContent });
        // 3. History (Conversation Turns)
        for (const entry of history) {
            if (entry.config) {
                // Assistant Turn (The Config)
                messages.push({
                    role: 'assistant',
                    content: JSON.stringify(entry.config, null, 2)
                });
                // User Turn (Feedback/Error)
                let feedbackText = "";
                if (entry.error) {
                    feedbackText += `Execution Error: ${entry.error}\n`;
                }
                if (entry.feedback) {
                    feedbackText += `Feedback: ${entry.feedback}\n`;
                }
                feedbackText += `Please fix the configuration based on this feedback.`;
                messages.push({
                    role: 'user',
                    content: feedbackText
                });
            }
            else {
                // Generation failed previously (no config produced)
                // We inform the model about the failure in a user message
                messages.push({
                    role: 'user',
                    content: `Previous attempt to generate configuration failed with error: ${entry.error || 'Unknown error'}. ${entry.feedback || ''}. Please try again and ensure valid JSON structure matching the schema.`
                });
            }
        }
        // Determine schema to use
        let schema = SafePipelineConfigSchema;
        let isDataOmitted = false;
        if (input.sampleRows && input.sampleRows.length > 0) {
            schema = SafePipelineConfigSchema.omit({ data: true });
            isDataOmitted = true;
        }
        const result = await generatorLlm.getRawClient().promptZod(messages, schema);
        if (isDataOmitted) {
            // Re-hydrate the result with default data config
            return SafePipelineConfigSchema.parse(result);
        }
        return result;
    }
    async execute(config, input) {
        // Create a modified config for testing
        const testConfig = JSON.parse(JSON.stringify(config));
        // Force limit to 5 for testing
        if (!testConfig.output) {
            testConfig.output = {};
        }
        testConfig.output.limit = 5;
        try {
            // We need to pass the sample rows to the execution service if we want to test with them.
            const result = await this.executionService.runConfig(testConfig, input.sampleRows);
            return { results: result.results };
        }
        catch (e) {
            return { results: [], error: e.message };
        }
    }
    async evaluate(input, config, output) {
        if (output.error) {
            return {
                success: false,
                feedback: `Execution Error: ${output.error}. Please fix the configuration to avoid this error.`
            };
        }
        const judgeLlm = this.llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [
                { type: 'text', text: 'You are a judge for a batch processing pipeline configuration. Your job is to determine if the execution results satisfy the user\'s request.' }
            ],
            promptParts: []
        });
        const prompt = [
            { type: 'text', text: `User Request: ${input.prompt}` },
            { type: 'text', text: `Generated Configuration:\n${JSON.stringify(config, null, 2)}` },
            { type: 'text', text: `Execution Results (First 5 rows):\n${JSON.stringify(output.results, null, 2)}` },
            { type: 'text', text: `Did this configuration produce the desired output? If yes, set success to true. If no, set success to false and provide specific feedback on what is wrong (e.g. missing columns, wrong data format, empty fields).` }
        ];
        const messages = [];
        const systemParts = judgeLlm.getSystemParts();
        if (systemParts.length > 0) {
            messages.push({ role: 'system', content: systemParts });
        }
        messages.push({ role: 'user', content: prompt });
        return await judgeLlm.getRawClient().promptZod(messages, EvaluationSchema);
    }
}
//# sourceMappingURL=ConfigRefiner.js.map
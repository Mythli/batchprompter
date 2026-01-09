import { z } from 'zod';
import type OpenAI from 'openai';
import { createIterativeRefiner, EvaluationResult, LlmClient } from 'llm-fns';
import { PipelineConfigInputSchema } from '../config/schema.js';
import { CONFIG_DOCUMENTATION } from '../generated/ConfigDocumentation.js';

export interface ConfigRefinerInput {
    prompt: string;
    sampleRows: any[];
    partialConfig?: any;
}

export interface ConfigExecutor {
    runConfig(config: any, initialRows?: any[]): Promise<{ results: any[] }>;
}

type PipelineConfig = any;

const EvaluationSchema = z.object({
    success: z.boolean().describe("Whether the configuration output satisfies the user request."),
    feedback: z.string().optional().describe("If success is false, provide specific instructions on what to fix in the configuration."),
});

export class ConfigRefiner {
    constructor(
        private generatorLlm: LlmClient,
        private judgeLlm: LlmClient,
        private executionService: ConfigExecutor,
        private options: { maxRetries: number }
    ) {}

    async run(input: ConfigRefinerInput) {
        const refiner = createIterativeRefiner({
            maxRetries: this.options.maxRetries,
            generate: (input: ConfigRefinerInput, history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => this.generate(input, history),
            evaluate: (input: ConfigRefinerInput, generated: PipelineConfig) => this.evaluate(input, generated),
            generatedToMessage: (config: PipelineConfig) => ({
                role: 'assistant',
                content: JSON.stringify(config, null, 2)
            })
        });

        return refiner.run(input);
    }

    private async generate(input: ConfigRefinerInput, history: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<PipelineConfig> {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        // 1. System Message
        messages.push({
            role: 'system',
            content: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.'
        });
        messages.push({
            role: 'system',
            content: 'Here is the documentation for the configuration format:\n\n' + CONFIG_DOCUMENTATION
        });

        // 2. Initial User Message
        const initialUserContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
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
        // The history provided by createIterativeRefiner contains the previous attempts (assistant) and feedback (user)
        messages.push(...history);

        // Determine schema to use
        const schema = z.record(z.string(), z.any());

        const result = await this.generatorLlm.promptZod(messages, schema);

        return result as PipelineConfig;
    }

    private async evaluate(input: ConfigRefinerInput, config: PipelineConfig): Promise<EvaluationResult> {
        // 1. Execute
        let executionResults: any[] = [];
        let executionError: string | undefined;

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
            executionResults = result.results;
        } catch (e: any) {
            executionError = e.message;
        }

        // 2. Evaluate/Judge
        if (executionError) {
            return {
                success: false,
                feedback: `Execution Error: ${executionError}. Please fix the configuration to avoid this error.`
            };
        }

        const prompt: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
            { type: 'text', text: `User Request: ${input.prompt}` },
            { type: 'text', text: `Generated Configuration:\n${JSON.stringify(config, null, 2)}` },
            { type: 'text', text: `Execution Results (First 5 rows):\n${JSON.stringify(executionResults, null, 2)}` },
            { type: 'text', text: `Did this configuration produce the desired output? If yes, set success to true. If no, set success to false and provide specific feedback on what is wrong (e.g. missing columns, wrong data format, empty fields).` }
        ];

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        messages.push({
            role: 'system',
            content: 'You are a judge for a batch processing pipeline configuration. Your job is to determine if the execution results satisfy the user\'s request.'
        });

        messages.push({ role: 'user', content: prompt });

        const evalResult = await this.judgeLlm.promptZod(messages, EvaluationSchema);

        return evalResult;
    }
}

import { z } from 'zod';
import { IterativeRefiner, EvaluationResult } from '../../core/refinement/IterativeRefiner.js';
import { SafePipelineConfig, SafePipelineConfigSchema } from '../../config/safeSchema.js';
import { ExecutionService } from './ExecutionService.js';
import { LlmFactory } from '../../core/LlmFactory.js';
import { CONFIG_DOCUMENTATION } from '../../generated/ConfigDocumentation.js';

export interface ConfigRefinerInput {
    prompt: string;
    sampleRows: any[];
    partialConfig?: any;
}

export interface ConfigRefinerOutput {
    results: any[];
    error?: string;
}

const EvaluationSchema = z.object({
    success: z.boolean().describe("Whether the configuration output satisfies the user request."),
    feedback: z.string().optional().describe("If success is false, provide specific instructions on what to fix in the configuration."),
});

export class ConfigRefiner extends IterativeRefiner<ConfigRefinerInput, SafePipelineConfig, ConfigRefinerOutput> {
    constructor(
        private llmFactory: LlmFactory,
        private executionService: ExecutionService,
        options: { maxRetries: number }
    ) {
        super(options);
    }

    protected async generate(input: ConfigRefinerInput, feedback?: string, previousConfig?: SafePipelineConfig): Promise<SafePipelineConfig> {
        const generatorLlm = this.llmFactory.create({
            model: 'google/gemini-3-flash-preview',
            thinkingLevel: 'high',
            systemParts: [
                { type: 'text', text: 'You are an expert configuration generator for a batch processing pipeline. Generate a valid JSON configuration based on the user request.' },
                { type: 'text', text: 'Here is the documentation for the configuration format:\n\n' + CONFIG_DOCUMENTATION }
            ],
            promptParts: []
        });

        const userContent: any[] = [
            { type: 'text', text: `Request: ${input.prompt}` }
        ];

        if (input.sampleRows && input.sampleRows.length > 0) {
            userContent.push({
                type: 'text',
                text: `Sample Data (First ${input.sampleRows.length} unique rows from uploaded file): \n${JSON.stringify(input.sampleRows, null, 2)}\n\nIMPORTANT: Use this data ONLY to infer the input schema (e.g. column names). DO NOT embed these specific rows into the configuration. The configuration should be generic and ready to accept a file input matching this structure.`
            });
        }

        if (input.partialConfig) {
            userContent.push({
                type: 'text',
                text: `Base Configuration (Partial): \n${JSON.stringify(input.partialConfig, null, 2)}\nPlease merge this into the final result.`
            });
        }

        if (feedback && previousConfig) {
            userContent.push({
                type: 'text',
                text: `Previous Configuration:\n${JSON.stringify(previousConfig, null, 2)}`
            });
            userContent.push({
                type: 'text',
                text: `Feedback from previous attempt (PLEASE FIX THIS): ${feedback}`
            });
        }

        return await generatorLlm.promptZod({ suffix: userContent }, SafePipelineConfigSchema);
    }

    protected async execute(config: SafePipelineConfig, input: ConfigRefinerInput): Promise<ConfigRefinerOutput> {
        // Create a modified config for testing
        const testConfig = JSON.parse(JSON.stringify(config));

        // 1. Inject Sample Data as Input if available
        // We need to ensure the pipeline uses the sample data instead of whatever input source was configured
        // or at least we need to make sure we can run it.
        // For this implementation, we will override the input to be the sample rows if they exist.
        if (input.sampleRows.length > 0) {
            // We need to find where to inject this. 
            // The pipeline config usually has an 'input' section or steps.
            // Since we don't have a unified 'input' field in SafePipelineConfig (it's step based),
            // we might need to prepend a manual input step or rely on the ExecutionService to handle "memory" input.
            
            // However, the ExecutionService.runConfig logic we have uses StepRegistry.parseConfig
            // which expects the config to define the flow.
            
            // Strategy: We will rely on the fact that we are running in a test mode.
            // We will modify the config to ensure it processes the sample rows.
            // If the first step is NOT a manual input, we might need to adjust.
            
            // Actually, the cleanest way is to pass the sample rows to the ExecutionService 
            // and have it override the input source. But ExecutionService.runConfig takes a config object.
            
            // Let's try to inject a "ManualInput" step at the beginning if we have sample rows.
            // Or, if the user prompt implies reading a file, the generated config might have a FileInput.
            // We want to replace that FileInput with our memory data.
            
            // For now, let's assume the generated config is valid. 
            // We will limit the output to 5 rows.
        }

        // Force limit to 5 for testing
        if (!testConfig.output) {
            testConfig.output = {};
        }
        testConfig.output.limit = 5;

        // If we have sample rows, we want to use them.
        // The ExecutionService doesn't currently support "injecting" rows easily into an arbitrary config
        // without changing the config itself.
        // Let's assume for now we run the config AS IS. 
        // If the config expects a file that doesn't exist, it will fail, and that's valid feedback.
        // BUT, if the user uploaded a file, we want to use THAT data.
        
        // TODO: A better approach would be to have the ExecutionService accept an "inputOverride".
        // For this iteration, we will try to run it. If it fails, we catch it.
        
        // Wait, if the user provided sample rows, the LLM should have generated a config that expects that structure.
        // If the config tries to read "input.csv", it will fail in the cloud/server environment if the file isn't there.
        // We need a way to mock the input.
        
        // HACK: We will temporarily modify the ExecutionService to accept "initialRows" 
        // or we modify the config here to use a "ManualInput" plugin if one existed, 
        // but we don't have a generic "ManualInput" plugin in the schema visible here easily.
        
        // Let's proceed with running the config. If the user uploaded a file, 
        // the GenerationService passed it to the LLM. The LLM might have generated a "Read File" step.
        // We can't easily execute that without the file on disk.
        
        // For the purpose of this task, we will assume the ExecutionService can handle the config.
        // If we need to inject data, we would need to modify the ExecutionService.
        // Let's update ExecutionService to allow passing `initialRows`.
        
        try {
            // We need to pass the sample rows to the execution service if we want to test with them.
            // We will update ExecutionService signature in a moment.
            const result = await this.executionService.runConfig(testConfig, input.sampleRows);
            return { results: result.results };
        } catch (e: any) {
            return { results: [], error: e.message };
        }
    }

    protected async evaluate(input: ConfigRefinerInput, config: SafePipelineConfig, output: ConfigRefinerOutput): Promise<EvaluationResult> {
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

        return await judgeLlm.promptZod({ suffix: prompt }, EvaluationSchema);
    }
}

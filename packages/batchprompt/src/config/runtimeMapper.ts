import { ResolvedPipelineConfig, ResolvedModelConfig } from './types.js';
import { RuntimeConfig, StepConfig } from '../types.js';

export function mapToRuntimeConfig(resolvedConfig: ResolvedPipelineConfig): RuntimeConfig {
    return {
        concurrency: resolvedConfig.globals.concurrency,
        taskConcurrency: resolvedConfig.globals.taskConcurrency,
        tmpDir: resolvedConfig.globals.tmpDir,
        dataOutputPath: resolvedConfig.globals.dataOutputPath,
        data: resolvedConfig.data,
        offset: resolvedConfig.inputOffset,
        limit: resolvedConfig.inputLimit,
        globals: resolvedConfig.globals,
        steps: resolvedConfig.steps.map((step) => {
            // In the new architecture, step.model is already a ModelConfig object
            // But we need to ensure it's fully populated if we are mapping from an old structure
            // or if we need to transform it.
            // However, ResolvedStepConfig (step) already matches StepConfig mostly.
            
            // If we are just passing through, we can return step as is, 
            // but let's be explicit to match the interface.

            const stepConfig: StepConfig = {
                model: step.model,
                tmpDir: step.tmpDir,
                // userPromptParts is derived from model.prompt if needed, but usually handled by resolver
                userPromptParts: undefined, 
                outputPath: step.outputTemplate,
                outputTemplate: step.outputTemplate,
                output: step.output,
                schema: step.schema,
                jsonSchema: step.schema,
                candidates: step.candidates,
                judge: step.judge,
                feedback: step.feedback,
                feedbackLoops: step.feedback?.loops || 0,
                aspectRatio: step.aspectRatio,
                plugins: step.plugins,
                timeout: step.timeout,
                noCandidateCommand: false,
                verifyCommand: step.verifyCommand,
                postProcessCommand: step.command,
                resolvedOutputDir: step.resolvedOutputDir,
                resolvedTempDir: step.resolvedTempDir || step.tmpDir,
                outputBasename: step.outputBasename,
                outputExtension: step.outputExtension
            };
            return stepConfig;
        })
    };
}

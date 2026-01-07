import { ResolvedPipelineConfig, ResolvedModelConfig } from './types.js';
import { RuntimeConfig, StepConfig } from '../types.js';

export function mapToRuntimeConfig(resolvedConfig: ResolvedPipelineConfig): RuntimeConfig {
    // The resolved config is already flat and matches RuntimeConfig structure
    // We just need to map the steps to ensure they match StepConfig interface strictly
    
    return {
        ...resolvedConfig,
        steps: resolvedConfig.steps.map((step) => {
            const stepConfig: StepConfig = {
                model: step.model,
                tmpDir: step.tmpDir,
                // userPromptParts is derived from model.prompt if needed, but usually handled by resolver
                userPromptParts: undefined, 
                outputPath: step.outputTemplate,
                outputTemplate: step.outputTemplate,
                output: step.output,
                schema: step.schema,
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

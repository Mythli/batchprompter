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
        steps: resolvedConfig.steps.map((step) => {
            const modelConfig: ResolvedModelConfig = {
                model: step.model,
                temperature: step.temperature,
                thinkingLevel: step.thinkingLevel,
                systemParts: step.system.parts,
                promptParts: step.prompt.parts
            };

            const plugins = step.plugins.map(p => ({
                name: p.type,
                config: p.rawConfig || {}, 
                output: p.output
            }));

            const stepConfig: StepConfig = {
                modelConfig,
                tmpDir: step.tmpDir,
                userPromptParts: step.prompt.parts,
                outputPath: step.outputTemplate,
                outputTemplate: step.outputTemplate,
                output: step.output,
                // Map schema correctly: string -> schemaPath, object -> jsonSchema
                schemaPath: typeof step.schema === 'string' ? step.schema : undefined,
                jsonSchema: typeof step.schema === 'object' ? step.schema : undefined,
                candidates: step.candidates,
                judge: step.judge,
                feedback: step.feedback,
                feedbackLoops: step.feedback?.loops || 0,
                aspectRatio: step.aspectRatio,
                plugins,
                timeout: step.timeout,
                noCandidateCommand: false,
                verifyCommand: step.verifyCommand,
                postProcessCommand: step.command,
                resolvedOutputDir: step.outputDir,
                resolvedTempDir: step.tmpDir, // Use tmpDir as resolvedTempDir if not set
                outputBasename: step.outputBasename,
                outputExtension: step.outputExtension
            };
            return stepConfig;
        })
    };
}

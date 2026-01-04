import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import {
    Plugin,
    PluginExecutionContext,
    PluginResult,
    StepHandlers,
    ServiceCapabilities,
    ContentResolver,
    OutputConfigSchema
} from 'batchprompt';
import { zHandlebars } from 'batchprompt/dist/config/validationRules.js';

const execAsync = promisify(exec);

export const ShellConfigSchema = z.object({
    type: z.literal('shell-command'),
    command: zHandlebars.optional().describe("Shell command to run after generation."),
    verifyCommand: zHandlebars.optional().describe("Shell command to verify the result."),
    skipCandidateCommand: z.boolean().default(false).describe("If true, skips running the post-process command on candidates."),
    output: OutputConfigSchema.default({
        mode: 'ignore',
        explode: false
    })
});

export type ShellConfig = z.infer<typeof ShellConfigSchema>;

export class ShellPlugin implements Plugin<ShellConfig, ShellConfig> {
    readonly type = 'shell-command';
    readonly configSchema = ShellConfigSchema;
    readonly cliOptions = []; // Managed by adapter

    getRequiredCapabilities(): (keyof ServiceCapabilities)[] {
        return [];
    }

    parseCLIOptions(): ShellConfig | null {
        return null; // Managed by adapter
    }

    async resolveConfig(
        rawConfig: ShellConfig,
        row: Record<string, any>,
        inheritedModel: any,
        contentResolver: ContentResolver
    ): Promise<ShellConfig> {
        return rawConfig;
    }

    async execute(
        config: ShellConfig,
        context: PluginExecutionContext
    ): Promise<PluginResult> {
        // This plugin doesn't gather data, it only provides handlers
        return { packets: [] };
    }

    getHandlers(
        config: ShellConfig,
        context: PluginExecutionContext
    ): Partial<StepHandlers> {
        return {
            verify: config.verifyCommand ? async (content, execContext) => {
                const tempFile = path.join(context.tempDirectory, `verify_${Date.now()}.tmp`);
                await fs.writeFile(tempFile, typeof content === 'string' ? content : JSON.stringify(content));

                try {
                    const template = Handlebars.compile(config.verifyCommand, { noEscape: true });
                    const cmd = template({
                        ...execContext.row,
                        ...execContext.workspace,
                        file: tempFile
                    });

                    await execAsync(cmd);
                    return { isValid: true };
                } catch (e: any) {
                    return { isValid: false, feedback: e.stderr || e.message };
                } finally {
                    await fs.unlink(tempFile).catch(() => {});
                }
            } : undefined,

            process: config.command ? async (execContext, result) => {
                // Skip if it's a candidate and we should skip
                // We detect candidate by checking if result is part of a larger set or context implies it?
                // The context doesn't explicitly say "isCandidate".
                // However, CandidateStrategy calls execute which calls process handlers.
                // If we are in a candidate generation loop, we might want to skip.
                // But the current architecture runs process handlers AFTER the model returns.
                // If CandidateStrategy runs the model, it gets a result.
                // Then it returns.
                // ActionRunner calls process handlers on the *selected* result (or all if no judge).
                // Wait, ActionRunner calls process handlers on `nextItems`.
                // If CandidateStrategy returns one winner, `nextItems` has 1 item.
                // If it returns multiple (no judge), `nextItems` has multiple.
                // So `process` runs on the *output* of the step.
                
                // The `skipCandidateCommand` flag in the original logic was used inside CandidateStrategy
                // to prevent running commands on *candidates* before judging.
                // But here, `process` runs *after* the step is done (after judging).
                // So `skipCandidateCommand` might be irrelevant if we only run on final output?
                // Actually, if `explode` is true, we have multiple items.
                // If `candidates` > 1 and NO judge, we have multiple items.
                // In that case, we probably DO want to run the command on all of them.
                
                // The original logic:
                // "skipCandidateCommand: If true, skips running the post-process command on candidates."
                // This implies that normally commands run on candidates?
                // In the old `CandidateStrategy`, it called `standardStrategy.execute`.
                // `StandardStrategy` executed the command.
                // So commands ran for EVERY candidate.
                // If we want to replicate that, we need to hook into `StandardStrategy`.
                // But `StandardStrategy` doesn't know about plugins anymore.
                
                // Wait, `ActionRunner` calls `executeModel`.
                // `executeModel` calls `strategy.execute`.
                // `StandardStrategy` returns a result.
                // `ActionRunner` then calls `handlers.process`.
                
                // So `handlers.process` runs ONCE per item returned by `executeModel`.
                // If `CandidateStrategy` is used:
                // 1. It generates N candidates.
                // 2. It judges and picks 1 (or returns all if no judge).
                // 3. `executeModel` returns the winner(s).
                // 4. `handlers.process` runs on the winner(s).
                
                // So we NEVER run commands on discarded candidates in this new architecture.
                // This is actually better/safer.
                // So `skipCandidateCommand` is effectively always true for discarded candidates,
                // and false for the winner.
                
                // However, if we want to run commands on candidates *during* generation (e.g. to render an image to judge it),
                // we can't do it with `handlers.process` in `ActionRunner`.
                // But `StandardStrategy` emits artifacts.
                // If the command is needed for judging (e.g. "compile code"), we might need it.
                // But `verify` runs during generation!
                // So if we use `verifyCommand`, it runs on candidates.
                
                // For `command` (post-process), it runs on the result.
                // So we just run it.
                
                const template = Handlebars.compile(config.command, { noEscape: true });
                
                // We need the file path. The `result` passed to process is the model output (string/object).
                // But the file path is determined by `ActionRunner` or `StepResolver`.
                // `execContext` doesn't have the output filename.
                // However, `ActionRunner` emits `plugin:artifact`.
                // The `ShellPlugin` doesn't know where the file is saved.
                
                // In the CLI `ShellCommandHandler` plan, I said:
                // "Context Awareness: Inside the handler, check context.variationIndex..."
                // "Templating: Use Handlebars to render... {{file}} pointing to temp file?"
                
                // If the command expects a file, we need to know where it is.
                // `ActionRunner` saves the artifact.
                // But `handlers.process` receives `result` which is the content.
                // We might need to write it to a temp file if we don't know the final path,
                // OR we rely on the fact that `ActionRunner` just saved it.
                // But we don't know the path.
                
                // Workaround: We can reconstruct the path if we have access to `resolvedStep` config in context?
                // `StepExecutionContext` doesn't have it.
                
                // Let's assume for now we write to a temp file for the command, 
                // unless we can pass the output path.
                // The original `StandardStrategy` logic for command:
                // It used `config.resolvedOutputDir` and `filename`.
                
                // Since we are decoupling, maybe we just provide the content in a temp file
                // and let the command move it if it wants?
                // Or we pass `{{file}}` as a placeholder that we replace with a temp file containing `result`.
                
                const tempFile = path.join(context.tempDirectory, `cmd_input_${Date.now()}.tmp`);
                await fs.writeFile(tempFile, typeof result === 'string' ? result : JSON.stringify(result));
                
                try {
                    const cmd = template({
                        ...execContext.row,
                        ...execContext.workspace,
                        file: tempFile
                    });
                    
                    await execAsync(cmd);
                } finally {
                    // Don't delete immediately if the command is async/background? 
                    // But we await execAsync.
                    // If the command modifies the file, we might want to read it back?
                    // The original implementation didn't read back.
                    await fs.unlink(tempFile).catch(() => {});
                }
            } : undefined
        };
    }
}
